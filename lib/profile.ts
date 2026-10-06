import type { ColType, ColumnInfo } from './schema';
import type { ParsedTable } from './parse';

const MISSING = new Set(['', 'na', 'nan', 'null', '-', 'n/a', 'none']);
const SPECIAL_STRINGS = new Set(['unknown', 'other']);
const SENTINELS = [-1, 999, 9999];
const ID_NAMES = /^(id|index|idx|row_?id|row_?num(ber)?|no|seq|unnamed:? ?0)$|_id$/i;
const NUM_RE = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
const DATE_RE = /^\d{4}[-/]\d{1,2}[-/]\d{1,2}([ T]\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

export function isMissing(v: string): boolean {
  return MISSING.has(v.toLowerCase());
}

export interface Column {
  name: string;
  index: number;
  type: ColType;
  inferredType: ColType;
  reason: string;
  constant: boolean;
  missing: number;
  nunique: number;
  /** 결측이면 NaN. 숫자가 아닌 값도 NaN (수치형 판별에서 특수 코드로 집계) */
  num: Float64Array;
  /** 범주 코드 (결측 −1). 범주형·이진·텍스트 열에만 */
  codes: Int32Array | null;
  /** 코드 → 값 */
  levels: string[];
  /** 값별 건수 (levels와 같은 순서) */
  counts: number[];
  special: Record<string, number>;
  /** 특수 코드 행 표시 (코드별) */
  specialRows: Map<string, Uint8Array>;
  /** 원값 (범주형·이진·텍스트·날짜 열에만 보관) */
  raw: string[] | null;
  /** 중복 열 탐지용 키 */
  hashKey: string;
}

function fnv1a(values: string[]): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (const v of values) {
    for (let i = 0; i < v.length; i++) {
      const c = v.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 16777619);
      h2 = Math.imul(h2 ^ c, 2246822519);
    }
    h1 = Math.imul(h1 ^ 31, 16777619);
    h2 = Math.imul(h2 ^ 31, 2246822519);
  }
  return (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16);
}

/** 4.1절 규칙으로 열 유형을 판별한다. override가 있으면 그 유형을 쓴다 (F-14) */
export function profileColumn(name: string, index: number, values: string[], nRows: number, override?: ColType): Column {
  const num = new Float64Array(values.length);
  const freq = new Map<string, number>();
  let missing = 0;
  let numericOk = 0;
  let integer = true;
  let dateOk = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (isMissing(v)) {
      missing++;
      num[i] = NaN;
      continue;
    }
    freq.set(v, (freq.get(v) ?? 0) + 1);
    if (NUM_RE.test(v)) {
      const x = Number(v);
      num[i] = x;
      numericOk++;
      if (integer && !Number.isInteger(x)) integer = false;
    } else {
      num[i] = NaN;
      if (DATE_RE.test(v)) dateOk++;
    }
  }
  const nonMissing = values.length - missing;
  const nunique = freq.size;
  const constant = nunique <= 1;
  const numericFrac = nonMissing ? numericOk / nonMissing : 0;

  let inferred: ColType;
  let reason: string;
  if (ID_NAMES.test(name) && nunique === nonMissing && nonMissing > 0) {
    inferred = 'id';
    reason = `이름이 식별자 형태이고 고유값 ${nunique.toLocaleString('ko-KR')}개 = 결측 아닌 행 수`;
  } else if (nunique === 2) {
    inferred = 'binary';
    reason = `고유값이 정확히 2개 (${[...freq.keys()].slice(0, 2).join(' / ')})`;
  } else if (nonMissing > 0 && dateOk / nonMissing >= 0.95) {
    inferred = 'date';
    reason = `값의 ${Math.round((dateOk / nonMissing) * 100)}%가 날짜 형식`;
  } else if (numericFrac >= 0.98 && nunique > 15) {
    inferred = 'numeric';
    reason = `값의 ${(numericFrac * 100).toFixed(1)}%가 숫자, 고유값 ${nunique.toLocaleString('ko-KR')}개`;
  } else if (numericFrac >= 0.98 && integer && nunique >= 3 && nunique <= 15) {
    inferred = 'categorical';
    reason = `정수이고 고유값 ${nunique}개 (순서형 범주)`;
  } else if (nunique <= Math.max(50, nRows * 0.05)) {
    inferred = 'categorical';
    reason = constant ? '고유값이 1개 이하 (상수)' : `고유값 ${nunique}개 ≤ max(50, 행 수의 5%)`;
  } else {
    inferred = 'text';
    reason = `문자열이고 고유값 ${nunique.toLocaleString('ko-KR')}개로 많음`;
  }
  const type = override ?? inferred;
  if (override && override !== inferred) reason = `사용자가 '${override}'로 지정 (자동 판별: ${inferred})`;

  // 특수 코드 (F-13): 문자열 unknown·other, 숫자 센티널, 수치형 열의 숫자 아닌 값
  const special: Record<string, number> = {};
  const specialRows = new Map<string, Uint8Array>();
  const mark = (code: string, i: number) => {
    special[code] = (special[code] ?? 0) + 1;
    let rows = specialRows.get(code);
    if (!rows) specialRows.set(code, (rows = new Uint8Array(values.length)));
    rows[i] = 1;
  };
  if (type === 'numeric') {
    for (let i = 0; i < values.length; i++) {
      const x = num[i];
      if (Number.isNaN(x)) {
        if (!isMissing(values[i])) mark(values[i], i);
      } else if (SENTINELS.includes(x)) mark(String(x), i);
    }
  } else if (type !== 'id') {
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (SPECIAL_STRINGS.has(v.toLowerCase())) mark(v, i);
    }
  }

  // 범주 코드
  let codes: Int32Array | null = null;
  let levels: string[] = [];
  let counts: number[] = [];
  if (type === 'categorical' || type === 'binary' || type === 'text') {
    const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    levels = sorted.map((e) => e[0]);
    counts = sorted.map((e) => e[1]);
    const lookup = new Map(levels.map((l, i) => [l, i]));
    codes = new Int32Array(values.length);
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      codes[i] = isMissing(v) ? -1 : lookup.get(v)!;
    }
  }
  if (type === 'date') {
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      num[i] = isMissing(v) ? NaN : Date.parse(v.replace(/\//g, '-'));
    }
  }

  return {
    name,
    index,
    type,
    inferredType: inferred,
    reason,
    constant,
    missing,
    nunique,
    num,
    codes,
    levels,
    counts,
    special,
    specialRows,
    raw: type === 'numeric' || type === 'id' ? null : values,
    hashKey: `${type}:${fnv1a(values)}`,
  };
}

export interface Profile {
  nRows: number;
  columns: Column[];
  duplicateRows: number;
  missingCells: number;
}

export function profileTable(table: ParsedTable, overrides: Record<string, ColType> = {}): Profile {
  const columns = table.headers.map((h, i) => profileColumn(h, i, table.columns[i], table.nRows, overrides[h]));
  // 중복 행
  const seen = new Set<string>();
  let duplicateRows = 0;
  for (let r = 0; r < table.nRows; r++) {
    let key = '';
    for (let c = 0; c < table.columns.length; c++) key += table.columns[c][r] + '\u0001';
    if (seen.has(key)) duplicateRows++;
    else seen.add(key);
  }
  const missingCells = columns.reduce((s, c) => s + c.missing, 0);
  return { nRows: table.nRows, columns, duplicateRows, missingCells };
}

export function toColumnInfo(c: Column): ColumnInfo {
  return {
    name: c.name,
    type: c.type,
    inferredType: c.inferredType,
    reason: c.reason,
    missing: c.missing,
    nunique: c.nunique,
    constant: c.constant,
    special: c.special,
  };
}
