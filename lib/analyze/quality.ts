// A. 개요 · C. 데이터 품질
import type { ColType, Result } from '../schema';
import type { Ctx } from './context';

export function analyzeOverview(ctx: Ctx): Result['overview'] {
  const byType: Record<ColType, number> = { id: 0, numeric: 0, binary: 0, categorical: 0, date: 0, text: 0 };
  for (const c of ctx.profile.columns) byType[c.type]++;
  return {
    rows: ctx.profile.nRows,
    cols: ctx.profile.columns.length,
    byType,
    missingCells: ctx.profile.missingCells,
    duplicateRows: ctx.profile.duplicateRows,
  };
}

export const SPECIAL_MIN_RATIO = 0.05;

export function analyzeQuality(ctx: Ctx): Result['quality'] {
  const { columns, nRows } = ctx.profile;
  const constant = columns.filter((c) => c.constant).map((c) => c.name);

  // 중복 열: 유형 + 원값 해시가 같으면 뒤 열을 중복으로 본다 (상수 열은 제외)
  const firstByKey = new Map<string, string>();
  const duplicates: [string, string][] = [];
  for (const c of columns) {
    if (c.constant) continue;
    const orig = firstByKey.get(c.hashKey);
    if (orig) duplicates.push([c.name, orig]);
    else firstByKey.set(c.hashKey, c.name);
  }

  const rare = columns
    .filter((c) => c.type === 'binary' && c.counts.length === 2)
    .filter((c) => Math.min(...c.counts) / (c.counts[0] + c.counts[1]) < 0.01)
    .map((c) => c.name);

  const allUnique = columns.filter((c) => c.nunique === nRows && nRows > 1).map((c) => c.name);
  const missing = columns
    .filter((c) => c.missing > 0)
    .map((c) => ({ name: c.name, ratio: c.missing / nRows }))
    .sort((a, b) => b.ratio - a.ratio);
  const highMissing = missing.filter((m) => m.ratio >= 0.3).map((m) => m.name);

  const special: Result['quality']['special'] = [];
  for (const c of columns) {
    for (const [code, count] of Object.entries(c.special)) {
      const ratio = count / nRows;
      if (ratio >= SPECIAL_MIN_RATIO) special.push({ name: c.name, code, count, ratio });
    }
  }
  special.sort((a, b) => b.ratio - a.ratio);

  // 겹치는 특수 코드: 두 열의 특수 코드 행이 99% 이상 일치
  const specialOverlapDetail: Result['quality']['specialOverlapDetail'] = [];
  for (let i = 0; i < special.length; i++) {
    for (let j = i + 1; j < special.length; j++) {
      const a = special[i];
      const b = special[j];
      if (a.name === b.name) continue;
      const ra = columns.find((c) => c.name === a.name)!.specialRows.get(a.code)!;
      const rb = columns.find((c) => c.name === b.name)!.specialRows.get(b.code)!;
      let inter = 0;
      let union = 0;
      for (let r = 0; r < nRows; r++) {
        const x = ra[r] | rb[r];
        union += x;
        inter += ra[r] & rb[r];
      }
      const match = union ? inter / union : 0;
      if (match >= 0.99) specialOverlapDetail.push({ a: a.name, codeA: a.code, b: b.name, codeB: b.code, match });
    }
  }

  return {
    constant,
    duplicates,
    rare,
    allUnique,
    highMissing,
    missing: missing.slice(0, 20),
    special,
    specialOverlaps: specialOverlapDetail.map((d) => [d.a, d.b] as [string, string]),
    specialOverlapDetail,
  };
}
