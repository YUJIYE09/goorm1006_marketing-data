import type { Column, Profile } from '../profile';
import type { TargetVector } from '../target';
import { mulberry32 } from '../stats';

/** 20만 행을 넘으면 2변량 분석은 무작위 표본으로 계산한다 (F-06) */
export const SAMPLE_LIMIT = 200_000;

export interface Ctx {
  profile: Profile;
  target: TargetVector | null;
  /** 타깃·식별자·텍스트·날짜를 뺀 입력 변수 */
  features: Column[];
  /** 2변량 분석용 행 번호 (표본이 아니면 null) */
  sample: Uint32Array | null;
  /** 2변량용 타깃 벡터 (표본 적용) */
  y: Float64Array | null;
  /** 2변량용 열 값 */
  num(col: Column): Float64Array;
  codes(col: Column): Int32Array;
  /** 이진 열의 1(양성) 지시값, 결측은 NaN */
  indicator(col: Column): Float64Array;
}

export function binaryOne(col: Column): string {
  const POS = ['1', 'yes', 'true', 'y', 't', 'positive', '1.0'];
  for (const p of POS) {
    const hit = col.levels.find((l) => l.toLowerCase() === p);
    if (hit !== undefined) return hit;
  }
  // 소수 값을 1로 본다
  return col.counts[1] <= col.counts[0] ? col.levels[1] : col.levels[0];
}

export function createContext(profile: Profile, target: TargetVector | null): Ctx {
  const n = profile.nRows;
  let sample: Uint32Array | null = null;
  if (n > SAMPLE_LIMIT) {
    const rand = mulberry32(42);
    const idx = new Uint32Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    for (let i = 0; i < SAMPLE_LIMIT; i++) {
      const j = i + Math.floor(rand() * (n - i));
      const t = idx[i];
      idx[i] = idx[j];
      idx[j] = t;
    }
    sample = idx.slice(0, SAMPLE_LIMIT).sort();
  }
  const pickF = (arr: Float64Array): Float64Array => {
    if (!sample) return arr;
    const out = new Float64Array(sample.length);
    for (let i = 0; i < sample.length; i++) out[i] = arr[sample[i]];
    return out;
  };
  const pickI = (arr: Int32Array): Int32Array => {
    if (!sample) return arr;
    const out = new Int32Array(sample.length);
    for (let i = 0; i < sample.length; i++) out[i] = arr[sample[i]];
    return out;
  };
  const numCache = new Map<Column, Float64Array>();
  const codeCache = new Map<Column, Int32Array>();
  const indCache = new Map<Column, Float64Array>();
  const features = profile.columns.filter(
    (c) => c !== target?.column && c.type !== 'id' && c.type !== 'text' && c.type !== 'date',
  );
  const ctx: Ctx = {
    profile,
    target,
    features,
    sample,
    y: target ? pickF(target.y) : null,
    num(col) {
      let v = numCache.get(col);
      if (!v) numCache.set(col, (v = pickF(col.num)));
      return v;
    },
    codes(col) {
      let v = codeCache.get(col);
      if (!v) codeCache.set(col, (v = pickI(col.codes ?? new Int32Array(n).fill(-1))));
      return v;
    },
    indicator(col) {
      let v = indCache.get(col);
      if (!v) {
        const one = col.levels.indexOf(binaryOne(col));
        const codes = ctx.codes(col);
        v = new Float64Array(codes.length);
        for (let i = 0; i < codes.length; i++) v[i] = codes[i] < 0 ? NaN : codes[i] === one ? 1 : 0;
        indCache.set(col, v);
      }
      return v;
    },
  };
  return ctx;
}

/** 타깃의 클래스 코드 (분류), 결측은 −1 */
export function targetCodes(ctx: Ctx): Int32Array {
  const y = ctx.y!;
  const out = new Int32Array(y.length);
  for (let i = 0; i < y.length; i++) out[i] = Number.isNaN(y[i]) ? -1 : y[i];
  return out;
}

export function nanToNull(v: number): number | null {
  return Number.isFinite(v) ? v : null;
}
