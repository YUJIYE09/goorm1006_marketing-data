// API 서버의 업무 로직: Blob 읽기 → 파싱 → 분석 → 저장
import { createHash } from 'node:crypto';
import { analyze, APP_VERSION } from '../lib/analyze';
import { AppError } from '../lib/errors';
import { parseCsv } from '../lib/parse';
import type { AnalysisOptions, ColType, CreateAnalysisRequest, Result, ResultBody } from '../lib/schema';
import { deleteBlob, readBlob } from './blob';
import { withRetry } from './http';
import { getRepo, type AnalysisRow, type DatasetRow } from './repo';

export const SOURCE_TTL_MS = 24 * 60 * 60 * 1000;

const warningsOf = (r: ResultBody) => r.insights.filter((i) => i.severity === 'high' || i.severity === 'medium').length;

/** 사용자가 바꾼 열 유형만 저장한다 */
function userTypes(r: ResultBody): Record<string, ColType> {
  return Object.fromEntries(r.columns.filter((c) => c.type !== c.inferredType).map((c) => [c.name, c.type]));
}

export function toResult(analysis: AnalysisRow, dataset: DatasetRow): Result {
  const r = analysis.result;
  return {
    ...r,
    id: analysis.id,
    datasetId: dataset.id,
    meta: { ...r.meta, sourceAvailable: dataset.blobUrl !== null },
  };
}

export async function createAnalysis(req: CreateAnalysisRequest): Promise<{ result: Result; duplicate: boolean }> {
  const repo = await getRepo();
  const bytes = await withRetry(() => readBlob(req.blobUrl));
  const sha = createHash('sha256').update(bytes).digest('hex');

  // F-44: 같은 파일이면 기존 결과로 안내 (타깃 지정 없이 올린 경우만)
  if (req.target === undefined && !req.columnTypes) {
    const prev = await repo.findBySha(sha);
    // 원본이 이미 지워진 결과면 타깃 변경이 안 되므로 새로 분석한다
    if (prev?.blobUrl) {
      const found = await repo.get(prev.analysisId);
      if (found) {
        await deleteBlob(req.blobUrl).catch(() => undefined);
        return { result: toResult(found.analysis, found.dataset), duplicate: true };
      }
    }
  }

  const table = parseCsv(bytes);
  const body = analyze({ table, fileName: req.fileName, options: req });
  const { datasetId, analysisId } = await withRetry(() =>
    repo.create(
      {
        fileName: req.fileName,
        fileSha256: sha,
        blobUrl: req.blobUrl,
        blobExpiresAt: new Date(Date.now() + SOURCE_TTL_MS).toISOString(),
        sizeBytes: bytes.byteLength,
        nRows: body.overview.rows,
        nCols: body.overview.cols,
        delimiter: table.delimiter,
      },
      {
        target: body.target,
        task: body.task,
        columnTypes: userTypes(body),
        result: body,
        warnings: warningsOf(body),
        durationMs: body.meta.durationMs,
        appVersion: APP_VERSION,
      },
    ),
  );
  return { result: { ...body, id: analysisId, datasetId }, duplicate: false };
}

export async function getAnalysis(id: string): Promise<Result> {
  const repo = await getRepo();
  const found = await withRetry(() => repo.get(id));
  if (!found) throw new AppError('NOT_FOUND', '분석을 찾을 수 없습니다. 삭제됐거나 주소가 잘못됐습니다.');
  return toResult(found.analysis, found.dataset);
}

export async function reanalyze(id: string, opts: AnalysisOptions): Promise<Result> {
  const repo = await getRepo();
  const found = await withRetry(() => repo.get(id));
  if (!found) throw new AppError('NOT_FOUND', '분석을 찾을 수 없습니다.');
  const { analysis, dataset } = found;
  if (!dataset.blobUrl) throw new AppError('SOURCE_EXPIRED', '원본 CSV가 24시간 보관 기간이 지나 삭제됐습니다. 다시 분석하려면 파일을 새로 올려 주세요.');
  const bytes = await withRetry(() => readBlob(dataset.blobUrl!));
  const table = parseCsv(bytes);
  const options: AnalysisOptions = {
    target: opts.target !== undefined ? opts.target : analysis.target,
    task: opts.task,
    columnTypes: opts.columnTypes ?? analysis.columnTypes,
  };
  const body = analyze({ table, fileName: dataset.fileName, options });
  await withRetry(() =>
    repo.update(id, {
      target: body.target,
      task: body.task,
      columnTypes: userTypes(body),
      result: body,
      warnings: warningsOf(body),
      durationMs: body.meta.durationMs,
      appVersion: APP_VERSION,
    }),
  );
  return { ...body, id, datasetId: dataset.id };
}

export async function deleteAnalysis(id: string): Promise<void> {
  const repo = await getRepo();
  const removed = await withRetry(() => repo.remove(id));
  if (!removed) throw new AppError('NOT_FOUND', '분석을 찾을 수 없습니다.');
  if (removed.blobUrl) await withRetry(() => deleteBlob(removed.blobUrl!));
}

export async function cleanupExpired(now = new Date()): Promise<number> {
  const repo = await getRepo();
  const rows = await repo.expired(now);
  for (const r of rows) {
    await withRetry(() => deleteBlob(r.blobUrl)).catch((e) => console.error('blob delete failed', r.blobUrl, e));
    await repo.clearBlob(r.datasetId);
  }
  return rows.length;
}
