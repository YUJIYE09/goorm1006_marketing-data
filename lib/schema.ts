// 서버와 프런트엔드가 같이 쓰는 Zod 스키마와 타입 (F-52)
import { z } from 'zod';

export const TaskSchema = z.enum(['regression', 'binary', 'multiclass', 'none']);
export const ColTypeSchema = z.enum(['id', 'numeric', 'binary', 'categorical', 'date', 'text']);
export const SeveritySchema = z.enum(['high', 'medium', 'low', 'info']);
export type Task = z.infer<typeof TaskSchema>;
export type ColType = z.infer<typeof ColTypeSchema>;
export type Severity = z.infer<typeof SeveritySchema>;

const num = z.number().nullable(); // NaN·Infinity는 JSON에서 null로 보낸다

export const HistogramSchema = z.object({ edges: z.array(z.number()), counts: z.array(z.number()) });

export const NumStatsSchema = z.object({
  count: z.number(),
  mean: num,
  std: num,
  min: num,
  p1: num,
  p5: num,
  p25: num,
  p50: num,
  p75: num,
  p95: num,
  p99: num,
  max: num,
  skew: num,
  kurtosis: num,
  iqrLow: num,
  iqrHigh: num,
  outliersLow: z.number(),
  outliersHigh: z.number(),
});
export type NumStats = z.infer<typeof NumStatsSchema>;

export const ColumnInfoSchema = z.object({
  name: z.string(),
  type: ColTypeSchema,
  inferredType: ColTypeSchema,
  reason: z.string(),
  missing: z.number(),
  nunique: z.number(),
  constant: z.boolean(),
  special: z.record(z.string(), z.number()),
});
export type ColumnInfo = z.infer<typeof ColumnInfoSchema>;

export const LoneOutlierSchema = z.object({ value: z.number(), second: z.number(), gap: z.number(), row: z.number(), id: z.string().nullable() });

export const TargetSummarySchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('regression'),
    stats: NumStatsSchema,
    histogram: HistogramSchema,
    loneOutlier: LoneOutlierSchema.nullable(),
    baseline: z.number(),
  }),
  z.object({
    kind: z.literal('classification'),
    classes: z.array(z.object({ label: z.string(), count: z.number(), ratio: z.number() })),
    positiveClass: z.string().nullable(),
    minorityRatio: z.number(),
    imbalance: z.number(),
    baseline: z.number(),
  }),
]);
export type TargetSummary = z.infer<typeof TargetSummarySchema>;

export const BinSchema = z.object({ label: z.string(), lo: z.number(), hi: z.number(), count: z.number(), value: num });

export const NumericSummarySchema = z.object({
  name: z.string(),
  stats: NumStatsSchema,
  histogram: HistogramSchema,
  association: num,
  bins: z.array(BinSchema),
  classMedians: z.array(z.object({ label: z.string(), median: num })),
  classHist: z.object({ edges: z.array(z.number()), series: z.array(z.object({ label: z.string(), counts: z.array(z.number()) })) }).nullable(),
});
export type NumericSummary = z.infer<typeof NumericSummarySchema>;

export const LevelSchema = z.object({
  label: z.string(),
  count: z.number(),
  value: num,
  box: z.object({ lo: z.number(), q1: z.number(), med: z.number(), q3: z.number(), hi: z.number() }).nullable(),
});

export const CategoricalSummarySchema = z.object({
  name: z.string(),
  nunique: z.number(),
  ordinal: z.boolean(),
  metric: z.enum(['eta2', 'cramersV']).nullable(),
  score: num,
  topRatio: z.number(),
  levels: z.array(LevelSchema),
  otherLevels: z.number(),
  otherCount: z.number(),
});
export type CategoricalSummary = z.infer<typeof CategoricalSummarySchema>;

export const BinarySummarySchema = z.object({
  name: z.string(),
  one: z.string(),
  zero: z.string(),
  countOne: z.number(),
  countZero: z.number(),
  oneRatio: z.number(),
  valueWhenOne: num,
  valueWhenZero: num,
  association: num,
});
export type BinarySummary = z.infer<typeof BinarySummarySchema>;

export const TextSummarySchema = z.object({
  name: z.string(),
  nunique: z.number(),
  top: z.array(z.object({ label: z.string(), count: z.number() })),
});

export const FeatureScoreSchema = z.object({
  name: z.string(),
  type: ColTypeSchema,
  score: z.number(),
  metric: z.enum(['r', 'eta2', 'cramersV']),
});
export type FeatureScore = z.infer<typeof FeatureScoreSchema>;

export const InsightSchema = z.object({
  rule: z.string(),
  severity: SeveritySchema,
  text: z.string(),
  columns: z.array(z.string()),
  section: z.string(),
});
export type Insight = z.infer<typeof InsightSchema>;

export const PeriodSchema = z.object({ label: z.string(), count: z.number(), value: num });

export const ResultSchema = z.object({
  id: z.string(),
  datasetId: z.string(),
  appVersion: z.string(),
  task: TaskSchema,
  target: z.string().nullable(),
  positiveClass: z.string().nullable(),
  meta: z.object({
    fileName: z.string(),
    delimiter: z.string(),
    encoding: z.string(),
    sampled: z.boolean(),
    sampleSize: z.number(),
    headerNotes: z.array(z.string()),
    durationMs: z.number(),
    generatedAt: z.string(),
    sourceAvailable: z.boolean(),
  }),
  overview: z.object({
    rows: z.number(),
    cols: z.number(),
    byType: z.record(ColTypeSchema, z.number()),
    missingCells: z.number(),
    duplicateRows: z.number(),
  }),
  columns: z.array(ColumnInfoSchema),
  targetSummary: TargetSummarySchema.nullable(),
  quality: z.object({
    constant: z.array(z.string()),
    duplicates: z.array(z.tuple([z.string(), z.string()])),
    rare: z.array(z.string()),
    allUnique: z.array(z.string()),
    highMissing: z.array(z.string()),
    missing: z.array(z.object({ name: z.string(), ratio: z.number() })),
    special: z.array(z.object({ name: z.string(), code: z.string(), count: z.number(), ratio: z.number() })),
    specialOverlaps: z.array(z.tuple([z.string(), z.string()])),
    specialOverlapDetail: z.array(z.object({ a: z.string(), codeA: z.string(), b: z.string(), codeB: z.string(), match: z.number() })),
  }),
  numeric: z.array(NumericSummarySchema),
  categorical: z.array(CategoricalSummarySchema),
  binary: z.array(BinarySummarySchema),
  text: z.array(TextSummarySchema),
  relations: z.object({
    topFeatures: z.array(FeatureScoreSchema),
    corrMatrix: z.object({ labels: z.array(z.string()), values: z.array(z.array(num)) }),
    highCorr: z.array(z.object({ a: z.string(), b: z.string(), r: z.number() })),
  }),
  timeline: z
    .object({
      index: z.array(z.number()),
      value: z.array(z.number()),
      window: z.number(),
      bins: z.array(z.number()),
      ratio: num,
      baseline: z.number(),
    })
    .nullable(),
  periodic: z.array(z.object({ name: z.string(), kind: z.enum(['month', 'weekday']), levels: z.array(PeriodSchema) })),
  dateTrends: z.array(z.object({ name: z.string(), granularity: z.enum(['day', 'month', 'year']), periods: z.array(PeriodSchema) })),
  leakage: z.array(z.object({ name: z.string(), reason: z.enum(['single_auc', 'single_r2', 'name_hint']), score: num })),
  insights: z.array(InsightSchema),
});
export type Result = z.infer<typeof ResultSchema>;
/** 저장 전, id가 붙기 전의 결과 */
export type ResultBody = Omit<Result, 'id' | 'datasetId'>;

// ---- API 요청·응답 ----

export const AnalysisOptionsSchema = z.object({
  /** 생략하면 자동 추정, null이면 타깃 없음 */
  target: z.string().nullable().optional(),
  task: TaskSchema.optional(),
  columnTypes: z.record(z.string(), ColTypeSchema).optional(),
});
export type AnalysisOptions = z.infer<typeof AnalysisOptionsSchema>;

export const CreateAnalysisRequestSchema = AnalysisOptionsSchema.extend({
  blobUrl: z.string().min(1),
  fileName: z.string().min(1).max(255),
  sizeBytes: z.number().int().nonnegative().optional(),
});
export type CreateAnalysisRequest = z.infer<typeof CreateAnalysisRequestSchema>;

export const PatchAnalysisRequestSchema = AnalysisOptionsSchema;

export const AnalysisListItemSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  rows: z.number().nullable(),
  cols: z.number().nullable(),
  task: TaskSchema,
  target: z.string().nullable(),
  warnings: z.number(),
  createdAt: z.string(),
  sourceAvailable: z.boolean(),
});
export type AnalysisListItem = z.infer<typeof AnalysisListItemSchema>;

export const AnalysisListSchema = z.object({
  items: z.array(AnalysisListItemSchema),
  page: z.number(),
  limit: z.number(),
  hasMore: z.boolean(),
});
export type AnalysisList = z.infer<typeof AnalysisListSchema>;

export const ErrorResponseSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) });

export const UploadTokenRequestSchema = z.object({
  fileName: z.string().min(1).max(255),
  size: z.number().int().nonnegative(),
  type: z.string().optional(),
});
