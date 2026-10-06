// H. 순서·시간
import type { Result } from '../schema';
import type { Column } from '../profile';
import { mean } from '../stats';
import { nanToNull, type Ctx } from './context';

const MAX_POINTS = 200;

/** 행 순서에 따른 타깃 이동평균 (창 = 행 수의 5%)과 5등분 구간 평균 */
export function analyzeTimeline(ctx: Ctx): Result['timeline'] {
  const t = ctx.target;
  if (!t || t.task === 'multiclass') return null;
  const y = t.y; // 행 순서가 의미이므로 표본이 아닌 전체를 쓴다
  const n = y.length;
  if (n < 20) return null;
  const window = Math.max(1, Math.round(n * 0.05));
  const cs = new Float64Array(n + 1);
  const cc = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    const ok = !Number.isNaN(y[i]);
    cs[i + 1] = cs[i] + (ok ? y[i] : 0);
    cc[i + 1] = cc[i] + (ok ? 1 : 0);
  }
  const index: number[] = [];
  const value: number[] = [];
  const steps = Math.min(MAX_POINTS, n - window + 1);
  for (let s = 0; s < steps; s++) {
    const end = window + Math.round((s * (n - window)) / Math.max(1, steps - 1));
    const start = end - window;
    const c = cc[end] - cc[start];
    if (!c) continue;
    index.push(end);
    value.push((cs[end] - cs[start]) / c);
  }
  const bins: number[] = [];
  for (let b = 0; b < 5; b++) {
    const start = Math.floor((b * n) / 5);
    const end = Math.floor(((b + 1) * n) / 5);
    const c = cc[end] - cc[start];
    bins.push(c ? (cs[end] - cs[start]) / c : NaN);
  }
  const min = Math.min(...bins);
  const max = Math.max(...bins);
  const ratio = min > 0 ? max / min : NaN;
  return { index, value, window, bins, ratio: nanToNull(ratio), baseline: mean(y) };
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function groupBy(ctx: Ctx, col: Column, keyOf: (raw: string) => number, labels: string[]) {
  const k = labels.length;
  const cnt = new Array<number>(k).fill(0);
  const sum = new Array<number>(k).fill(0);
  const yc = new Array<number>(k).fill(0);
  const y = ctx.target && ctx.target.task !== 'multiclass' ? ctx.target.y : null;
  const raw = col.raw;
  if (!raw) return null;
  for (let i = 0; i < raw.length; i++) {
    const g = keyOf(raw[i]);
    if (g < 0) continue;
    cnt[g]++;
    if (y && !Number.isNaN(y[i])) {
      sum[g] += y[i];
      yc[g]++;
    }
  }
  return labels.map((label, i) => ({ label, count: cnt[i], value: y && yc[i] ? sum[i] / yc[i] : null }));
}

/** V-12: 월·요일 열 감지 */
export function analyzePeriodic(ctx: Ctx): Result['periodic'] {
  const out: Result['periodic'] = [];
  for (const c of ctx.profile.columns) {
    if (c === ctx.target?.column || !c.raw || (c.type !== 'categorical' && c.type !== 'binary')) continue;
    const lower = c.levels.map((l) => l.toLowerCase().slice(0, 3));
    if (/month|^mon$|월/i.test(c.name) || lower.every((l) => MONTHS.includes(l))) {
      if (lower.every((l) => MONTHS.includes(l))) {
        const levels = groupBy(ctx, c, (v) => MONTHS.indexOf(v.toLowerCase().slice(0, 3)), MONTHS);
        if (levels) out.push({ name: c.name, kind: 'month', levels: levels.filter((l) => l.count > 0) });
        continue;
      }
      if (c.levels.every((l) => /^\d{1,2}$/.test(l) && +l >= 1 && +l <= 12)) {
        const labels = Array.from({ length: 12 }, (_, i) => `${i + 1}월`);
        const levels = groupBy(ctx, c, (v) => (/^\d{1,2}$/.test(v) ? +v - 1 : -1), labels);
        if (levels) out.push({ name: c.name, kind: 'month', levels: levels.filter((l) => l.count > 0) });
        continue;
      }
    }
    if (/weekday|day_of_week|dow|요일/i.test(c.name) || (lower.length >= 2 && lower.every((l) => WEEKDAYS.includes(l)))) {
      if (lower.every((l) => WEEKDAYS.includes(l))) {
        const levels = groupBy(ctx, c, (v) => WEEKDAYS.indexOf(v.toLowerCase().slice(0, 3)), WEEKDAYS);
        if (levels) out.push({ name: c.name, kind: 'weekday', levels: levels.filter((l) => l.count > 0) });
      }
    }
  }
  return out;
}

/** 날짜 열의 기간별 건수와 타깃 평균 */
export function analyzeDates(ctx: Ctx): Result['dateTrends'] {
  const out: Result['dateTrends'] = [];
  const y = ctx.target && ctx.target.task !== 'multiclass' ? ctx.target.y : null;
  for (const c of ctx.profile.columns) {
    if (c.type !== 'date') continue;
    let min = Infinity;
    let max = -Infinity;
    for (const v of c.num) if (!Number.isNaN(v)) { if (v < min) min = v; if (v > max) max = v; }
    if (!Number.isFinite(min)) continue;
    const days = (max - min) / 86_400_000;
    const granularity = days > 365 * 10 ? 'year' : days > 90 ? 'month' : 'day';
    const keyLen = granularity === 'year' ? 4 : granularity === 'month' ? 7 : 10;
    const groups = new Map<string, { count: number; sum: number; yc: number }>();
    for (let i = 0; i < c.num.length; i++) {
      const v = c.num[i];
      if (Number.isNaN(v)) continue;
      const key = new Date(v).toISOString().slice(0, keyLen);
      let g = groups.get(key);
      if (!g) groups.set(key, (g = { count: 0, sum: 0, yc: 0 }));
      g.count++;
      if (y && !Number.isNaN(y[i])) { g.sum += y[i]; g.yc++; }
    }
    const periods = [...groups.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .slice(-120)
      .map(([label, g]) => ({ label, count: g.count, value: g.yc ? g.sum / g.yc : null }));
    out.push({ name: c.name, granularity, periods });
  }
  return out;
}
