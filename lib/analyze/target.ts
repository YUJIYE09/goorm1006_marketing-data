// B. 타깃
import type { TargetSummary } from '../schema';
import { autoBins, histogram, mean, sortedFinite, std } from '../stats';
import type { Ctx } from './context';
import { describe } from './describe';

export function analyzeTarget(ctx: Ctx): TargetSummary | null {
  const t = ctx.target;
  if (!t) return null;
  if (t.task === 'regression') {
    const sorted = sortedFinite(t.y);
    const stats = describe(sorted);
    const hist = histogram(sorted, autoBins(sorted.length));
    // 단독 이상치: 최댓값 − 두 번째 값 > 2 × 표준편차
    let loneOutlier = null;
    if (sorted.length >= 3) {
      const max = sorted[sorted.length - 1];
      const second = sorted[sorted.length - 2];
      const sd = std(sorted);
      if (max - second > 2 * sd) {
        const row = t.y.indexOf(max);
        const idCol = ctx.profile.columns.find((c) => c.type === 'id');
        loneOutlier = {
          value: max,
          second,
          gap: max - second,
          row: row + 1,
          id: idCol ? String(Number.isNaN(idCol.num[row]) ? '' : idCol.num[row]) || null : null,
        };
      }
    }
    return { kind: 'regression', stats, histogram: hist, loneOutlier, baseline: mean(t.y) };
  }
  const counts = new Array<number>(t.classes.length).fill(0);
  let n = 0;
  if (t.task === 'binary') {
    // y는 0/1이므로 클래스 이름 순서로 다시 센다
    const posIdx = t.classes.indexOf(t.positiveClass!);
    const negIdx = 1 - posIdx;
    for (let i = 0; i < t.y.length; i++) {
      const v = t.y[i];
      if (Number.isNaN(v)) continue;
      n++;
      counts[v === 1 ? posIdx : negIdx]++;
    }
  } else {
    for (let i = 0; i < t.y.length; i++) {
      const v = t.y[i];
      if (Number.isNaN(v)) continue;
      n++;
      counts[v]++;
    }
  }
  const classes = t.classes.map((label, i) => ({ label, count: counts[i], ratio: n ? counts[i] / n : 0 }));
  // 양성 클래스를 뒤로 보내 누적 막대에서 강조색이 오른쪽에 오게 한다
  if (t.positiveClass) classes.sort((a, b) => (a.label === t.positiveClass ? 1 : b.label === t.positiveClass ? -1 : 0));
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  return {
    kind: 'classification',
    classes,
    positiveClass: t.positiveClass,
    minorityRatio: n ? min / n : 0,
    imbalance: min ? max / min : 0,
    baseline: t.task === 'binary' ? mean(t.y) : n ? max / n : 0,
  };
}
