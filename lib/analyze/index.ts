// 파싱된 표 → Result 본문. 서버와 테스트가 같이 쓴다.
import { AppError } from '../errors';
import { buildInsights } from '../insights';
import type { ParsedTable } from '../parse';
import { profileTable, toColumnInfo } from '../profile';
import type { AnalysisOptions, FeatureScore, ResultBody } from '../schema';
import { buildTarget, guessTarget } from '../target';
import { createContext } from './context';
import { analyzeBinary, analyzeCategorical, analyzeNumeric, analyzeText } from './features';
import { analyzeOverview, analyzeQuality } from './quality';
import { analyzeLeakage, analyzeRelations, topFeatures } from './relations';
import { analyzeTarget } from './target';
import { analyzeDates, analyzePeriodic, analyzeTimeline } from './timeline';

export const APP_VERSION = '2.1.0';

export interface AnalyzeInput {
  table: ParsedTable;
  fileName: string;
  options?: AnalysisOptions;
  sourceAvailable?: boolean;
}

export function analyze({ table, fileName, options = {}, sourceAvailable = true }: AnalyzeInput): ResultBody {
  const t0 = performance.now();
  const profile = profileTable(table, options.columnTypes ?? {});
  const targetName = options.target === undefined ? guessTarget(profile) : options.target;
  if (targetName !== null && !profile.columns.some((c) => c.name === targetName)) {
    throw new AppError('INVALID_TARGET', `'${targetName}' 열을 찾을 수 없습니다.`);
  }
  const target = targetName === null || options.task === 'none' ? null : buildTarget(profile, targetName, options.task);
  const ctx = createContext(profile, target);

  const quality = analyzeQuality(ctx);
  const numeric = analyzeNumeric(ctx);
  const categorical = analyzeCategorical(ctx);
  const binary = analyzeBinary(ctx);

  const assoc = new Map<string, { score: number | null; metric: FeatureScore['metric'] }>();
  for (const n of numeric) {
    // 다중 분류에서 수치형 연관은 상관비(√η²)로 계산했으므로 η²로 저장한다
    if (target?.task === 'multiclass') assoc.set(n.name, { score: n.association === null ? null : n.association ** 2, metric: 'eta2' });
    else assoc.set(n.name, { score: n.association, metric: 'r' });
  }
  for (const b of binary) assoc.set(b.name, { score: b.association, metric: target?.task === 'multiclass' ? 'cramersV' : 'r' });
  for (const c of categorical) if (c.metric) assoc.set(c.name, { score: c.score, metric: c.metric });
  const top = topFeatures(ctx, assoc);
  const duplicateNames = new Set(quality.duplicates.map((d) => d[0]));

  const body: Omit<ResultBody, 'insights'> = {
    appVersion: APP_VERSION,
    task: target ? target.task : 'none',
    target: target ? target.name : null,
    positiveClass: target?.positiveClass ?? null,
    meta: {
      fileName,
      delimiter: table.delimiter,
      encoding: table.encoding,
      sampled: ctx.sample !== null,
      sampleSize: ctx.sample ? ctx.sample.length : profile.nRows,
      headerNotes: table.headerNotes,
      durationMs: 0,
      generatedAt: new Date().toISOString(),
      sourceAvailable,
    },
    overview: analyzeOverview(ctx),
    columns: profile.columns.map(toColumnInfo),
    targetSummary: analyzeTarget(ctx),
    quality,
    numeric,
    categorical,
    binary,
    text: analyzeText(ctx),
    relations: analyzeRelations(ctx, top, duplicateNames),
    timeline: analyzeTimeline(ctx),
    periodic: analyzePeriodic(ctx),
    dateTrends: analyzeDates(ctx),
    leakage: analyzeLeakage(ctx, top),
  };
  const insights = buildInsights(body);
  body.meta.durationMs = Math.round(performance.now() - t0);
  return { ...body, insights };
}
