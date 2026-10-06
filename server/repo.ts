// 저장소. DATABASE_URL이 있으면 Neon(Drizzle, HTTP 모드), 없으면 로컬 JSON 파일(.local-data/db.json)
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AnalysisListItem, ColType, ResultBody, Task } from '../lib/schema';

export interface DatasetRow {
  id: string;
  fileName: string;
  fileSha256: string;
  blobUrl: string | null;
  blobExpiresAt: string;
  sizeBytes: number;
  nRows: number | null;
  nCols: number | null;
  delimiter: string | null;
  createdAt: string;
}

export interface AnalysisRow {
  id: string;
  datasetId: string;
  target: string | null;
  task: Task;
  columnTypes: Record<string, ColType>;
  result: ResultBody;
  warnings: number;
  durationMs: number | null;
  appVersion: string;
  createdAt: string;
}

export type NewDataset = Omit<DatasetRow, 'id' | 'createdAt'>;
export type NewAnalysis = Omit<AnalysisRow, 'id' | 'createdAt'>;

export interface Repo {
  mode: 'neon' | 'local';
  /** 데이터셋과 분석을 한 번에 저장 (Neon에서는 transaction) */
  create(dataset: NewDataset, analysis: Omit<NewAnalysis, 'datasetId'>): Promise<{ datasetId: string; analysisId: string }>;
  get(id: string): Promise<{ analysis: AnalysisRow; dataset: DatasetRow } | null>;
  update(id: string, patch: Pick<AnalysisRow, 'target' | 'task' | 'columnTypes' | 'result' | 'warnings' | 'durationMs' | 'appVersion'>): Promise<void>;
  list(page: number, limit: number): Promise<{ items: AnalysisListItem[]; hasMore: boolean }>;
  /** 분석과 데이터셋을 지우고 원본 Blob 주소를 돌려준다 */
  remove(id: string): Promise<{ blobUrl: string | null } | null>;
  findBySha(sha: string): Promise<{ analysisId: string; blobUrl: string | null } | null>;
  expired(now: Date): Promise<{ datasetId: string; blobUrl: string }[]>;
  clearBlob(datasetId: string): Promise<void>;
  health(): Promise<boolean>;
}

const toListItem = (a: AnalysisRow, d: DatasetRow): AnalysisListItem => ({
  id: a.id,
  fileName: d.fileName,
  rows: d.nRows,
  cols: d.nCols,
  task: a.task,
  target: a.target,
  warnings: a.warnings,
  createdAt: a.createdAt,
  sourceAvailable: d.blobUrl !== null,
});

// ---------- 로컬 JSON ----------

interface LocalDb {
  datasets: DatasetRow[];
  analyses: AnalysisRow[];
}

function localRepo(): Repo {
  const file = join(process.cwd(), '.local-data', 'db.json');
  let queue: Promise<unknown> = Promise.resolve();
  const load = async (): Promise<LocalDb> => {
    try {
      return JSON.parse(await readFile(file, 'utf8')) as LocalDb;
    } catch {
      return { datasets: [], analyses: [] };
    }
  };
  const save = async (db: LocalDb) => {
    await mkdir(join(process.cwd(), '.local-data'), { recursive: true });
    await writeFile(file, JSON.stringify(db));
  };
  // 쓰기를 순서대로 처리
  const tx = <T>(fn: (db: LocalDb) => T | Promise<T>): Promise<T> => {
    const p = queue.then(async () => {
      const db = await load();
      const out = await fn(db);
      await save(db);
      return out;
    });
    queue = p.catch(() => undefined);
    return p;
  };
  const now = () => new Date().toISOString();
  return {
    mode: 'local',
    create: (dataset, analysis) =>
      tx((db) => {
        const d: DatasetRow = { ...dataset, id: randomUUID(), createdAt: now() };
        const a: AnalysisRow = { ...analysis, datasetId: d.id, id: randomUUID(), createdAt: now() };
        db.datasets.push(d);
        db.analyses.push(a);
        return { datasetId: d.id, analysisId: a.id };
      }),
    async get(id) {
      const db = await load();
      const analysis = db.analyses.find((a) => a.id === id);
      const dataset = analysis && db.datasets.find((d) => d.id === analysis.datasetId);
      return analysis && dataset ? { analysis, dataset } : null;
    },
    update: (id, patch) =>
      tx((db) => {
        const a = db.analyses.find((x) => x.id === id);
        if (a) Object.assign(a, patch);
      }),
    async list(page, limit) {
      const db = await load();
      const sorted = [...db.analyses].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      const slice = sorted.slice((page - 1) * limit, page * limit + 1);
      const items = slice.slice(0, limit).map((a) => toListItem(a, db.datasets.find((d) => d.id === a.datasetId)!));
      return { items, hasMore: slice.length > limit };
    },
    remove: (id) =>
      tx((db) => {
        const a = db.analyses.find((x) => x.id === id);
        if (!a) return null;
        const d = db.datasets.find((x) => x.id === a.datasetId);
        db.analyses = db.analyses.filter((x) => x.datasetId !== a.datasetId);
        db.datasets = db.datasets.filter((x) => x.id !== a.datasetId);
        return { blobUrl: d?.blobUrl ?? null };
      }),
    async findBySha(sha) {
      const db = await load();
      const d = [...db.datasets].reverse().find((x) => x.fileSha256 === sha);
      const a = d && db.analyses.find((x) => x.datasetId === d.id);
      return d && a ? { analysisId: a.id, blobUrl: d.blobUrl } : null;
    },
    async expired(at) {
      const db = await load();
      return db.datasets
        .filter((d) => d.blobUrl && new Date(d.blobExpiresAt) < at)
        .map((d) => ({ datasetId: d.id, blobUrl: d.blobUrl! }));
    },
    clearBlob: (datasetId) =>
      tx((db) => {
        const d = db.datasets.find((x) => x.id === datasetId);
        if (d) d.blobUrl = null;
      }),
    health: async () => true,
  };
}

// ---------- Neon ----------

async function neonRepo(url: string): Promise<Repo> {
  const { neon } = await import('@neondatabase/serverless');
  const { drizzle } = await import('drizzle-orm/neon-http');
  const { and, desc, eq, isNotNull, lt } = await import('drizzle-orm');
  const { analyses, datasets } = await import('../db/schema');
  const db = drizzle(neon(url));
  const iso = (d: Date | string) => (d instanceof Date ? d.toISOString() : d);
  const ds = (d: typeof datasets.$inferSelect): DatasetRow => ({ ...d, blobExpiresAt: iso(d.blobExpiresAt), createdAt: iso(d.createdAt) });
  const an = (a: typeof analyses.$inferSelect): AnalysisRow => ({ ...a, task: a.task as Task, createdAt: iso(a.createdAt) });
  const get: Repo['get'] = async (id) => {
    const rows = await db.select().from(analyses).innerJoin(datasets, eq(analyses.datasetId, datasets.id)).where(eq(analyses.id, id)).limit(1);
    return rows[0] ? { analysis: an(rows[0].analyses), dataset: ds(rows[0].datasets) } : null;
  };
  return {
    mode: 'neon',
    async create(dataset, analysis) {
      const datasetId = randomUUID();
      const analysisId = randomUUID();
      await db.batch([
        db.insert(datasets).values({ ...dataset, id: datasetId, blobExpiresAt: new Date(dataset.blobExpiresAt) }),
        db.insert(analyses).values({ ...analysis, id: analysisId, datasetId }),
      ]);
      return { datasetId, analysisId };
    },
    get,
    async update(id, patch) {
      await db.update(analyses).set(patch).where(eq(analyses.id, id));
    },
    async list(page, limit) {
      const rows = await db
        .select()
        .from(analyses)
        .innerJoin(datasets, eq(analyses.datasetId, datasets.id))
        .orderBy(desc(analyses.createdAt))
        .limit(limit + 1)
        .offset((page - 1) * limit);
      return { items: rows.slice(0, limit).map((r) => toListItem(an(r.analyses), ds(r.datasets))), hasMore: rows.length > limit };
    },
    async remove(id) {
      const found = await get(id);
      if (!found) return null;
      await db.delete(datasets).where(eq(datasets.id, found.dataset.id)); // analyses는 on delete cascade
      return { blobUrl: found.dataset.blobUrl };
    },
    async findBySha(sha) {
      const rows = await db
        .select({ analysisId: analyses.id, blobUrl: datasets.blobUrl })
        .from(datasets)
        .innerJoin(analyses, eq(analyses.datasetId, datasets.id))
        .where(eq(datasets.fileSha256, sha))
        .orderBy(desc(datasets.createdAt))
        .limit(1);
      return rows[0] ?? null;
    },
    async expired(at) {
      const rows = await db
        .select({ datasetId: datasets.id, blobUrl: datasets.blobUrl })
        .from(datasets)
        .where(and(isNotNull(datasets.blobUrl), lt(datasets.blobExpiresAt, at)));
      return rows.map((r) => ({ datasetId: r.datasetId, blobUrl: r.blobUrl! }));
    },
    async clearBlob(datasetId) {
      await db.update(datasets).set({ blobUrl: null }).where(eq(datasets.id, datasetId));
    },
    async health() {
      const { sql } = await import('drizzle-orm');
      await db.execute(sql`select 1`);
      return true;
    },
  };
}

let cached: Promise<Repo> | null = null;
export function getRepo(): Promise<Repo> {
  if (!cached) cached = process.env.DATABASE_URL ? neonRepo(process.env.DATABASE_URL) : Promise.resolve(localRepo());
  return cached;
}
