// D. 수치형 · E. 범주형 · F. 이진 피처 · 텍스트 빈도
import type { BinarySummary, CategoricalSummary, NumericSummary } from '../schema';
import type { Column } from '../profile';
import { autoBins, cramersV, eta2, histogram, pearson, quantileSorted, sortedFinite } from '../stats';
import { binaryOne, nanToNull, targetCodes, type Ctx } from './context';
import { describe } from './describe';

const fmtEdge = (v: number) => (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('ko-KR') : String(Math.round(v * 100) / 100));

/** 열과 타깃의 연관도. 회귀·이진은 피어슨 r, 다중 분류는 상관비 √η² */
function numericAssociation(ctx: Ctx, x: Float64Array): number {
  const t = ctx.target;
  if (!t) return NaN;
  if (t.task === 'multiclass') return Math.sqrt(eta2(targetCodes(ctx), x, t.classes.length));
  return pearson(x, ctx.y!);
}

/** 분위수 10구간별 타깃 평균 (같은 경계는 합침) */
function decileBins(x: Float64Array, y: Float64Array | null) {
  const sorted = sortedFinite(x);
  if (!sorted.length) return [];
  const edges: number[] = [];
  for (let i = 0; i <= 10; i++) {
    const e = quantileSorted(sorted, i / 10);
    if (!edges.length || e > edges[edges.length - 1]) edges.push(e);
  }
  if (edges.length === 1) edges.push(edges[0]);
  const k = edges.length - 1;
  const cnt = new Array<number>(k).fill(0);
  const sum = new Array<number>(k).fill(0);
  const ycnt = new Array<number>(k).fill(0);
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    if (Number.isNaN(v)) continue;
    // (e_j, e_{j+1}], 첫 구간은 왼쪽 포함
    let lo = 0;
    let hi = k - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (v <= edges[mid + 1]) hi = mid;
      else lo = mid + 1;
    }
    cnt[lo]++;
    if (y && !Number.isNaN(y[i])) {
      sum[lo] += y[i];
      ycnt[lo]++;
    }
  }
  return edges.slice(0, -1).map((lo, j) => ({
    label: k === 1 ? fmtEdge(lo) : `${fmtEdge(lo)}~${fmtEdge(edges[j + 1])}`,
    lo,
    hi: edges[j + 1],
    count: cnt[j],
    value: y && ycnt[j] ? sum[j] / ycnt[j] : null,
  }));
}

export function analyzeNumeric(ctx: Ctx): NumericSummary[] {
  const t = ctx.target;
  const cols = ctx.features.filter((c) => c.type === 'numeric');
  const out = cols.map((col) => {
    const sorted = sortedFinite(col.num);
    const x = ctx.num(col);
    const assoc = numericAssociation(ctx, x);
    const regressionOrBinary = t && t.task !== 'multiclass';
    const classMedians: { label: string; median: number | null }[] = [];
    if (t && t.task !== 'regression') {
      const groups: number[][] = t.classes.map(() => []);
      const codes = targetCodes(ctx);
      for (let i = 0; i < x.length; i++) if (codes[i] >= 0 && !Number.isNaN(x[i])) groups[codes[i]].push(x[i]);
      const labels = t.task === 'binary' ? [t.classes.find((c) => c !== t.positiveClass)!, t.positiveClass!] : t.classes;
      groups.forEach((g, i) => {
        g.sort((a, b) => a - b);
        classMedians.push({ label: labels[i], median: nanToNull(quantileSorted(g, 0.5)) });
      });
    }
    return {
      name: col.name,
      stats: describe(sorted),
      histogram: histogram(sorted, autoBins(sorted.length)),
      association: nanToNull(assoc),
      bins: decileBins(x, regressionOrBinary ? ctx.y : null),
      classMedians,
      classHist: null as NumericSummary['classHist'],
    };
  });
  // V-07: 분류에서 연관 상위 수치형 6개만 클래스별 분포를 계산한다
  if (t && t.task !== 'regression') {
    const top = [...out].sort((a, b) => Math.abs(b.association ?? 0) - Math.abs(a.association ?? 0)).slice(0, 6);
    const codes = targetCodes(ctx);
    const labels = t.task === 'binary' ? [t.classes.find((c) => c !== t.positiveClass)!, t.positiveClass!] : t.classes;
    for (const s of top) {
      const col = cols.find((c) => c.name === s.name)!;
      const x = ctx.num(col);
      // 1~99 백분위 범위로 자른 공통 구간
      const lo = s.stats.p1 ?? 0;
      const hi = s.stats.p99 ?? 1;
      const bins = 20;
      const width = hi > lo ? (hi - lo) / bins : 1;
      const series = labels.map((label) => ({ label, counts: new Array<number>(bins).fill(0) }));
      for (let i = 0; i < x.length; i++) {
        const v = x[i];
        if (Number.isNaN(v) || codes[i] < 0) continue;
        let b = Math.floor((v - lo) / width);
        if (b < 0) b = 0;
        if (b >= bins) b = bins - 1;
        series[codes[i]].counts[b]++;
      }
      s.classHist = { edges: Array.from({ length: bins + 1 }, (_, i) => lo + i * width), series };
    }
  }
  return out;
}

const MAX_LEVELS = 50;

export function analyzeCategorical(ctx: Ctx): CategoricalSummary[] {
  const t = ctx.target;
  const cols = ctx.features.filter((c) => c.type === 'categorical');
  return cols.map((col) => {
    const codes = ctx.codes(col);
    const k = col.levels.length;
    const nonMissing = ctx.profile.nRows - col.missing;
    let metric: CategoricalSummary['metric'] = null;
    let score = NaN;
    const sum = new Float64Array(k);
    const ycnt = new Float64Array(k);
    if (t) {
      const y = ctx.y!;
      for (let i = 0; i < codes.length; i++) {
        const c = codes[i];
        if (c < 0) continue;
        if (!Number.isNaN(y[i])) {
          sum[c] += y[i];
          ycnt[c]++;
        }
      }
      if (t.task === 'regression') {
        metric = 'eta2';
        score = eta2(codes, y, k);
      } else {
        metric = 'cramersV';
        score = cramersV(codes, k, targetCodes(ctx), t.classes.length);
      }
    }
    let order = col.levels.map((_, i) => i);
    const valueOf = (i: number) => (t && t.task !== 'multiclass' && ycnt[i] ? sum[i] / ycnt[i] : null);
    // 회귀: 박스플롯을 중앙값 순으로, 분류: 양성 비율 내림차순, 타깃 없음: 빈도순
    const boxes: CategoricalSummary['levels'][number]['box'][] = new Array(k).fill(null);
    if (t?.task === 'regression') {
      const top = order.slice(0, MAX_LEVELS);
      const inTop = new Int32Array(k).fill(-1);
      top.forEach((c, j) => (inTop[c] = j));
      const groups: number[][] = top.map(() => []);
      const y = ctx.y!;
      for (let i = 0; i < codes.length; i++) {
        const c = codes[i];
        if (c >= 0 && inTop[c] >= 0 && !Number.isNaN(y[i])) groups[inTop[c]].push(y[i]);
      }
      top.forEach((c, j) => {
        const g = groups[j].sort((a, b) => a - b);
        if (!g.length) return;
        const q1 = quantileSorted(g, 0.25);
        const q3 = quantileSorted(g, 0.75);
        const iqr = q3 - q1;
        const lo = Math.max(g[0], q1 - 1.5 * iqr);
        const hi = Math.min(g[g.length - 1], q3 + 1.5 * iqr);
        boxes[c] = { lo, q1, med: quantileSorted(g, 0.5), q3, hi };
      });
      order = top.sort((a, b) => (boxes[a]?.med ?? 0) - (boxes[b]?.med ?? 0)).concat(order.slice(MAX_LEVELS));
    } else if (t?.task === 'binary') {
      order = order.slice(0, MAX_LEVELS).sort((a, b) => (valueOf(b) ?? 0) - (valueOf(a) ?? 0)).concat(order.slice(MAX_LEVELS));
    }
    const shown = order.slice(0, MAX_LEVELS);
    const rest = order.slice(MAX_LEVELS);
    return {
      name: col.name,
      nunique: col.nunique,
      ordinal: /정수/.test(col.reason),
      metric,
      score: nanToNull(score),
      topRatio: nonMissing ? col.counts[0] / nonMissing : 0,
      levels: shown.map((i) => ({ label: col.levels[i], count: col.counts[i], value: valueOf(i), box: boxes[i] })),
      otherLevels: rest.length,
      otherCount: rest.reduce((s, i) => s + col.counts[i], 0),
    };
  });
}

export function analyzeBinary(ctx: Ctx): BinarySummary[] {
  const t = ctx.target;
  return ctx.features
    .filter((c) => c.type === 'binary')
    .map((col: Column) => {
      const one = binaryOne(col);
      const zero = col.levels.find((l) => l !== one)!;
      const ind = ctx.indicator(col);
      let valueWhenOne = NaN;
      let valueWhenZero = NaN;
      let association = NaN;
      if (t) {
        const y = ctx.y!;
        if (t.task === 'multiclass') {
          const codes = new Int32Array(ind.length);
          for (let i = 0; i < ind.length; i++) codes[i] = Number.isNaN(ind[i]) ? -1 : ind[i];
          association = cramersV(codes, 2, targetCodes(ctx), t.classes.length);
        } else {
          let s1 = 0, n1 = 0, s0 = 0, n0 = 0;
          for (let i = 0; i < ind.length; i++) {
            if (Number.isNaN(ind[i]) || Number.isNaN(y[i])) continue;
            if (ind[i] === 1) { s1 += y[i]; n1++; } else { s0 += y[i]; n0++; }
          }
          valueWhenOne = n1 ? s1 / n1 : NaN;
          valueWhenZero = n0 ? s0 / n0 : NaN;
          association = pearson(ind, y);
        }
      }
      const countOne = col.counts[col.levels.indexOf(one)];
      const countZero = col.counts[col.levels.indexOf(zero)];
      return {
        name: col.name,
        one,
        zero,
        countOne,
        countZero,
        oneRatio: countOne / (countOne + countZero),
        valueWhenOne: nanToNull(valueWhenOne),
        valueWhenZero: nanToNull(valueWhenZero),
        association: nanToNull(association),
      };
    });
}

export function analyzeText(ctx: Ctx) {
  return ctx.profile.columns
    .filter((c) => c.type === 'text')
    .map((c) => ({
      name: c.name,
      nunique: c.nunique,
      top: c.levels.slice(0, 10).map((label, i) => ({ label, count: c.counts[i] })),
    }));
}
