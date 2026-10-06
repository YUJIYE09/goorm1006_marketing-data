// 7.4절 DB 스키마 (Drizzle). 원본 행은 넣지 않고 데이터셋 정보와 집계 결과만 저장한다.
import { bigint, index, integer, jsonb, pgTable, text, timestamp, uuid, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { ColType, ResultBody } from '../lib/schema';

export const datasets = pgTable(
  'datasets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fileName: text('file_name').notNull(),
    fileSha256: text('file_sha256').notNull(),
    blobUrl: text('blob_url'), // 원본 삭제 후 null
    blobExpiresAt: timestamp('blob_expires_at', { withTimezone: true }).notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    nRows: integer('n_rows'),
    nCols: integer('n_cols'),
    delimiter: text('delimiter'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('datasets_sha_idx').on(t.fileSha256)],
);

export const analyses = pgTable(
  'analyses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    datasetId: uuid('dataset_id')
      .notNull()
      .references(() => datasets.id, { onDelete: 'cascade' }),
    target: text('target'),
    task: text('task').notNull(),
    columnTypes: jsonb('column_types').$type<Record<string, ColType>>().notNull(),
    result: jsonb('result').$type<ResultBody>().notNull(),
    warnings: integer('warnings').notNull().default(0),
    durationMs: integer('duration_ms'),
    appVersion: text('app_version').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('analyses_created_at_idx').on(t.createdAt.desc()),
    check('analyses_task_check', sql`${t.task} in ('regression','binary','multiclass','none')`),
  ],
);

// v3: LLM 해설 (테이블만 미리 만든다)
export const llmExplanations = pgTable('llm_explanations', {
  id: uuid('id').primaryKey().defaultRandom(),
  analysisId: uuid('analysis_id')
    .notNull()
    .references(() => analyses.id, { onDelete: 'cascade' }),
  question: text('question'),
  answer: text('answer').notNull(),
  model: text('model').notNull(),
  tokensIn: integer('tokens_in'),
  tokensOut: integer('tokens_out'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
