import type { NumStats } from '../schema';
import { mean, moments, quantileSorted, std } from '../stats';
import { nanToNull } from './context';

export function describe(sorted: Float64Array): NumStats {
  const q = (p: number) => nanToNull(quantileSorted(sorted, p));
  const q1 = quantileSorted(sorted, 0.25);
  const q3 = quantileSorted(sorted, 0.75);
  const iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr;
  const hi = q3 + 1.5 * iqr;
  let outliersLow = 0;
  let outliersHigh = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i] < lo) outliersLow++;
    else if (sorted[i] > hi) outliersHigh++;
  }
  const { skew, kurtosis } = moments(sorted);
  return {
    count: sorted.length,
    mean: nanToNull(mean(sorted)),
    std: nanToNull(std(sorted)),
    min: sorted.length ? sorted[0] : null,
    p1: q(0.01),
    p5: q(0.05),
    p25: q(0.25),
    p50: q(0.5),
    p75: q(0.75),
    p95: q(0.95),
    p99: q(0.99),
    max: sorted.length ? sorted[sorted.length - 1] : null,
    skew: sorted.length ? nanToNull(skew) : null,
    kurtosis: sorted.length ? nanToNull(kurtosis) : null,
    iqrLow: nanToNull(lo),
    iqrHigh: nanToNull(hi),
    outliersLow,
    outliersHigh,
  };
}
