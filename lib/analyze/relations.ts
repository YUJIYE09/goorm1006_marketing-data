// G. 관계 · I. 누수 점검
import type { FeatureScore, Result } from '../schema';
import type { Column } from '../profile';
import { aucSymmetric, pearson } from '../stats';
import { nanToNull, type Ctx } from './context';

/** 서로 다른 지표를 한 줄로 세우기 위한 강도 (η²는 √를 씌워 r과 같은 척도로) */
export function strength(f: FeatureScore): number {
  return f.metric === 'eta2' ? Math.sqrt(Math.max(0, f.score)) : Math.abs(f.score);
}

export function topFeatures(ctx: Ctx, assoc: Map<string, { score: number | null; metric: FeatureScore['metric'] }>): FeatureScore[] {
  if (!ctx.target) return [];
  const out: FeatureScore[] = [];
  for (const c of ctx.features) {
    const a = assoc.get(c.name);
    if (!a || a.score === null || c.constant) continue;
    out.push({ name: c.name, type: c.type, score: a.score, metric: a.metric });
  }
  return out.sort((a, b) => strength(b) - strength(a));
}

function vectorOf(ctx: Ctx, c: Column): Float64Array {
  return c.type === 'binary' ? ctx.indicator(c) : ctx.num(c);
}

export function analyzeRelations(ctx: Ctx, top: FeatureScore[], duplicateNames: Set<string>): Result['relations'] {
  // 이진·수치형 상위 50개 (중복·상수 제외)
  const pool = ctx.features.filter((c) => (c.type === 'numeric' || c.type === 'binary') && !c.constant && !duplicateNames.has(c.name));
  let ranked: Column[];
  if (top.length) {
    const rank = new Map(top.map((f, i) => [f.name, i]));
    ranked = [...pool].sort((a, b) => (rank.get(a.name) ?? 1e9) - (rank.get(b.name) ?? 1e9));
  } else ranked = pool;
  const cand = ranked.slice(0, 50);
  const vecs = cand.map((c) => vectorOf(ctx, c));
  const k = cand.length;
  const r: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(1));
  const highCorr: Result['relations']['highCorr'] = [];
  for (let i = 0; i < k; i++)
    for (let j = i + 1; j < k; j++) {
      const v = pearson(vecs[i], vecs[j]);
      r[i][j] = r[j][i] = v;
      if (Math.abs(v) > 0.95) highCorr.push({ a: cand[i].name, b: cand[j].name, r: v });
    }
  highCorr.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));

  // 행렬: 상위 12개 (타깃이 있으면 연관 순, 없으면 다른 변수와의 평균 |r| 순)
  let idx = cand.map((_, i) => i);
  if (!top.length) {
    const avg = idx.map((i) => r[i].reduce((s, v, j) => (j === i || Number.isNaN(v) ? s : s + Math.abs(v)), 0));
    idx.sort((a, b) => avg[b] - avg[a]);
  }
  idx = idx.slice(0, 12);
  const labels = idx.map((i) => cand[i].name);
  const values = idx.map((i) => idx.map((j) => nanToNull(r[i][j])));
  // 타깃이 수치·이진이면 행렬 맨 앞에 넣는다
  const t = ctx.target;
  if (t && t.task !== 'multiclass' && labels.length >= 2) {
    const ty = ctx.y!;
    const tr = idx.map((i) => nanToNull(pearson(vecs[i], ty)));
    labels.unshift(t.name);
    values.forEach((row, i) => row.unshift(tr[i]));
    values.unshift([1, ...tr]);
  }
  return { topFeatures: top, corrMatrix: { labels, values }, highCorr: highCorr.slice(0, 50) };
}

const LEAK_HINTS = /duration|result|outcome_after|_after|after_|paid|closed|resolved|settled|refund|cancel|final_|churned_at|end_date/i;

export function analyzeLeakage(ctx: Ctx, top: FeatureScore[]): Result['leakage'] {
  const t = ctx.target;
  if (!t) return [];
  const out: Result['leakage'] = [];
  const y = ctx.y!;
  for (const c of ctx.features) {
    if (c.constant) continue;
    if (t.task === 'binary') {
      let scores: Float64Array;
      if (c.type === 'numeric') scores = ctx.num(c);
      else {
        // 범주별 양성 비율을 점수로
        const codes = ctx.codes(c);
        const k = c.levels.length;
        const sum = new Float64Array(k);
        const cnt = new Float64Array(k);
        for (let i = 0; i < codes.length; i++)
          if (codes[i] >= 0 && !Number.isNaN(y[i])) {
            sum[codes[i]] += y[i];
            cnt[codes[i]]++;
          }
        scores = new Float64Array(codes.length);
        for (let i = 0; i < codes.length; i++) scores[i] = codes[i] < 0 || !cnt[codes[i]] ? NaN : sum[codes[i]] / cnt[codes[i]];
      }
      const auc = aucSymmetric(scores, y);
      if (auc >= 0.9) out.push({ name: c.name, reason: 'single_auc', score: auc });
    } else if (t.task === 'regression') {
      const f = top.find((x) => x.name === c.name);
      if (f) {
        const r2 = f.metric === 'r' ? f.score ** 2 : f.score;
        if (r2 >= 0.9) out.push({ name: c.name, reason: 'single_r2', score: r2 });
      }
    }
  }
  const top3 = top.slice(0, 3).map((f) => f.name);
  for (const name of top3) {
    if (LEAK_HINTS.test(name) && !out.some((l) => l.name === name)) {
      const f = top.find((x) => x.name === name)!;
      out.push({ name, reason: 'name_hint', score: f.score });
    }
  }
  return out;
}

/** 수치형 단일 변수 AUC (요약·인사이트에서 씀) */
export function numericAuc(ctx: Ctx, c: Column): number | null {
  if (ctx.target?.task !== 'binary') return null;
  return nanToNull(aucSymmetric(ctx.num(c), ctx.y!));
}
