// 통계 순수 함수. 입력의 NaN은 결측으로 보고 건너뛴다.

export function finite(values: ArrayLike<number>): Float64Array {
  let n = 0;
  for (let i = 0; i < values.length; i++) if (!Number.isNaN(values[i])) n++;
  const out = new Float64Array(n);
  let j = 0;
  for (let i = 0; i < values.length; i++) if (!Number.isNaN(values[i])) out[j++] = values[i];
  return out;
}

export function mean(values: ArrayLike<number>): number {
  let s = 0;
  let n = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!Number.isNaN(v)) {
      s += v;
      n++;
    }
  }
  return n ? s / n : NaN;
}

/** 표본 표준편차 (n − 1) */
export function std(values: ArrayLike<number>): number {
  const m = mean(values);
  let ss = 0;
  let n = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!Number.isNaN(v)) {
      ss += (v - m) ** 2;
      n++;
    }
  }
  return n > 1 ? Math.sqrt(ss / (n - 1)) : NaN;
}

/** 정렬된 배열의 분위수 (pandas 기본값과 같은 선형 보간) */
export function quantileSorted(sorted: ArrayLike<number>, q: number): number {
  const n = sorted.length;
  if (!n) return NaN;
  const pos = (n - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function sortedFinite(values: ArrayLike<number>): Float64Array {
  return finite(values).sort();
}

/** 모집단 공식 왜도·첨도(초과) */
export function moments(values: ArrayLike<number>): { skew: number; kurtosis: number } {
  const m = mean(values);
  let m2 = 0;
  let m3 = 0;
  let m4 = 0;
  let n = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (Number.isNaN(v)) continue;
    const d = v - m;
    const d2 = d * d;
    m2 += d2;
    m3 += d2 * d;
    m4 += d2 * d2;
    n++;
  }
  if (!n || m2 === 0) return { skew: 0, kurtosis: 0 };
  m2 /= n;
  m3 /= n;
  m4 /= n;
  return { skew: m3 / m2 ** 1.5, kurtosis: m4 / (m2 * m2) - 3 };
}

/** 피어슨 r, 결측 쌍 제외 */
export function pearson(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let n = 0;
  let sa = 0;
  let sb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (Number.isNaN(x) || Number.isNaN(y)) continue;
    sa += x;
    sb += y;
    n++;
  }
  if (n < 3) return NaN;
  const ma = sa / n;
  const mb = sb / n;
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (Number.isNaN(x) || Number.isNaN(y)) continue;
    const dx = x - ma;
    const dy = y - mb;
    sab += dx * dy;
    saa += dx * dx;
    sbb += dy * dy;
  }
  if (saa === 0 || sbb === 0) return NaN;
  return sab / Math.sqrt(saa * sbb);
}

/** η² = 그룹 간 제곱합 ÷ 전체 제곱합. codes < 0 또는 y가 NaN이면 제외 */
export function eta2(codes: ArrayLike<number>, y: ArrayLike<number>, k: number): number {
  const sum = new Float64Array(k);
  const cnt = new Float64Array(k);
  let total = 0;
  let n = 0;
  for (let i = 0; i < codes.length; i++) {
    const c = codes[i];
    const v = y[i];
    if (c < 0 || Number.isNaN(v)) continue;
    sum[c] += v;
    cnt[c]++;
    total += v;
    n++;
  }
  if (!n) return NaN;
  const m = total / n;
  let sst = 0;
  for (let i = 0; i < codes.length; i++) {
    const c = codes[i];
    const v = y[i];
    if (c < 0 || Number.isNaN(v)) continue;
    sst += (v - m) ** 2;
  }
  if (sst === 0) return NaN;
  let ssb = 0;
  for (let g = 0; g < k; g++) if (cnt[g]) ssb += cnt[g] * (sum[g] / cnt[g] - m) ** 2;
  return ssb / sst;
}

/** Cramér's V (연속성 보정 없음). 음수 코드는 결측으로 제외 */
export function cramersV(a: ArrayLike<number>, ka: number, b: ArrayLike<number>, kb: number): number {
  const table = new Float64Array(ka * kb);
  let n = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x < 0 || y < 0) continue;
    table[x * kb + y]++;
    n++;
  }
  if (!n) return NaN;
  const rows = new Float64Array(ka);
  const cols = new Float64Array(kb);
  for (let i = 0; i < ka; i++)
    for (let j = 0; j < kb; j++) {
      rows[i] += table[i * kb + j];
      cols[j] += table[i * kb + j];
    }
  let chi = 0;
  let r = 0;
  let c = 0;
  for (let i = 0; i < ka; i++) if (rows[i]) r++;
  for (let j = 0; j < kb; j++) if (cols[j]) c++;
  for (let i = 0; i < ka; i++) {
    if (!rows[i]) continue;
    for (let j = 0; j < kb; j++) {
      if (!cols[j]) continue;
      const e = (rows[i] * cols[j]) / n;
      chi += (table[i * kb + j] - e) ** 2 / e;
    }
  }
  const d = Math.min(r, c) - 1;
  return d > 0 ? Math.sqrt(chi / (n * d)) : NaN;
}

/** ROC-AUC (순위 기반, 동점은 평균 순위). labels는 0/1, NaN 제외. 0.5 미만이면 1 − AUC */
export function aucSymmetric(scores: ArrayLike<number>, labels: ArrayLike<number>): number {
  const idx: number[] = [];
  for (let i = 0; i < scores.length; i++)
    if (!Number.isNaN(scores[i]) && !Number.isNaN(labels[i])) idx.push(i);
  idx.sort((p, q) => scores[p] - scores[q]);
  let pos = 0;
  let rankSum = 0;
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && scores[idx[j + 1]] === scores[idx[i]]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) {
      if (labels[idx[k]] === 1) {
        rankSum += avg;
        pos++;
      }
    }
    i = j + 1;
  }
  const neg = idx.length - pos;
  if (!pos || !neg) return NaN;
  const auc = (rankSum - (pos * (pos + 1)) / 2) / (pos * neg);
  return auc < 0.5 ? 1 - auc : auc;
}

export interface Histogram {
  edges: number[];
  counts: number[];
}

export function histogram(sorted: ArrayLike<number>, bins: number, lo?: number, hi?: number): Histogram {
  const n = sorted.length;
  const min = lo ?? (n ? sorted[0] : 0);
  const max = hi ?? (n ? sorted[n - 1] : 1);
  const width = max > min ? (max - min) / bins : 1;
  const edges = Array.from({ length: bins + 1 }, (_, i) => min + i * width);
  const counts = new Array<number>(bins).fill(0);
  for (let i = 0; i < n; i++) {
    let b = Math.floor((sorted[i] - min) / width);
    if (b >= bins) b = bins - 1;
    if (b < 0) b = 0;
    counts[b]++;
  }
  return { edges, counts };
}

/** √n개 구간, 10~40 사이 */
export function autoBins(n: number): number {
  return Math.max(10, Math.min(40, Math.round(Math.sqrt(n))));
}

/** 결정적 의사난수 (표본 추출용) */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function round(v: number, digits = 4): number {
  if (!Number.isFinite(v)) return v;
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}
