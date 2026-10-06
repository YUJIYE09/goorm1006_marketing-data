// V-01 타깃 분포 · V-06 수치형 구간별 타깃 · V-07 클래스별 분포 · V-08 이진 1의 비율 · 단변량 히스토그램
import { Bar } from 'react-chartjs-2';
import type { BinarySummary, NumericSummary, NumStats } from '../../../lib/schema';
import { baseOptions, ChartFrame, count, fmt, pct, refLinePlugin, useTheme, withAlpha } from './setup';

const edgeLabel = (edges: number[], i: number) => `${fmt(edges[i])}~${fmt(edges[i + 1])}`;

/** V-01: √n 구간 히스토그램, IQR 밖 구간은 경고색 */
export function V01TargetHistogram({ hist, stats, unit = '' }: { hist: { edges: number[]; counts: number[] }; stats: NumStats; unit?: string }) {
  const theme = useTheme();
  const labels = hist.counts.map((_, i) => edgeLabel(hist.edges, i));
  const colors = hist.counts.map((_, i) => {
    const mid = (hist.edges[i] + hist.edges[i + 1]) / 2;
    const out = (stats.iqrLow !== null && mid < stats.iqrLow) || (stats.iqrHigh !== null && mid > stats.iqrHigh);
    return out ? theme.warn : theme.accent;
  });
  const opts = baseOptions(theme, { xTitle: `값${unit ? ` (${unit})` : ''}`, yTitle: '건수' });
  opts.plugins!.tooltip!.callbacks = { label: (c) => `${count(c.raw as number)}` };
  (opts.scales!.x as { ticks: { maxTicksLimit?: number } }).ticks.maxTicksLimit = 8;
  return (
    <ChartFrame label={`타깃 분포 히스토그램, 평균 ${fmt(stats.mean)}, IQR 밖 구간은 주황`}>
      <Bar
        key={theme.key}
        data={{ labels, datasets: [{ data: hist.counts, backgroundColor: colors, borderRadius: 2, categoryPercentage: 1, barPercentage: 0.95 }] }}
        options={opts}
      />
    </ChartFrame>
  );
}

/** 타깃 없음 또는 수치형 단변량 */
export function MiniHistogram({ s }: { s: NumericSummary }) {
  const theme = useTheme();
  const labels = s.histogram.counts.map((_, i) => edgeLabel(s.histogram.edges, i));
  const opts = baseOptions(theme, { yTitle: '건수' });
  opts.plugins!.tooltip!.callbacks = { label: (c) => count(c.raw as number) };
  (opts.scales!.x as { ticks: { maxTicksLimit?: number } }).ticks.maxTicksLimit = 5;
  return (
    <ChartFrame label={`${s.name} 분포`} height={180}>
      <Bar key={theme.key} data={{ labels, datasets: [{ data: s.histogram.counts, backgroundColor: theme.accent, borderRadius: 2, categoryPercentage: 1, barPercentage: 0.95 }] }} options={opts} />
    </ChartFrame>
  );
}

/** V-06: 분위수 10구간 막대 + 전체 평균 점선. 건수 30 미만은 흐리게 */
export function V06NumericBins({ s, baseline, isRate, targetLabel }: { s: NumericSummary; baseline: number; isRate: boolean; targetLabel: string }) {
  const theme = useTheme();
  const values = s.bins.map((b) => (b.value === null ? null : isRate ? b.value * 100 : b.value));
  const base = isRate ? baseline * 100 : baseline;
  const colors = s.bins.map((b) => {
    const c = b.value !== null && (isRate ? b.value * 100 : b.value) >= base ? theme.accent : theme.muted;
    return b.count < 30 ? withAlpha(c, 0.35) : c;
  });
  const opts = baseOptions(theme, { xTitle: `${s.name} 구간 (분위수)`, yTitle: isRate ? `${targetLabel} (%)` : `${targetLabel} 평균` });
  opts.plugins!.tooltip!.callbacks = {
    label: (c) => {
      const b = s.bins[c.dataIndex];
      return `${targetLabel} ${isRate ? pct(b.value) : fmt(b.value)} · ${count(b.count)}`;
    },
  };
  return (
    <ChartFrame label={`${s.name} 구간별 ${targetLabel}`} height={220}>
      <Bar
        key={theme.key}
        data={{ labels: s.bins.map((b) => b.label), datasets: [{ data: values, backgroundColor: colors, borderRadius: 4 }] }}
        options={opts}
        plugins={[refLinePlugin(base, `전체 ${isRate ? `${base.toFixed(1)}%` : fmt(base)}`, theme)]}
      />
    </ChartFrame>
  );
}

/** V-07: 클래스별 분포. 클래스 크기가 달라서 클래스 안 비율(%)로 그린다. 양성 = 강조색 */
export function V07ClassHist({ s, positive }: { s: NumericSummary; positive: string | null }) {
  const theme = useTheme();
  const h = s.classHist;
  if (!h) return null;
  const labels = h.series[0].counts.map((_, i) => edgeLabel(h.edges, i));
  const palette = [theme.muted, theme.accent, theme.series2, theme.negative];
  const datasets = h.series.map((ser, i) => {
    const total = ser.counts.reduce((a, b) => a + b, 0) || 1;
    const color = positive ? (ser.label === positive ? theme.accent : theme.muted) : palette[i % palette.length];
    return {
      label: ser.label,
      data: ser.counts.map((c) => (c / total) * 100),
      raw: ser.counts,
      backgroundColor: withAlpha(color, 0.8),
      borderRadius: 2,
      categoryPercentage: 1,
      barPercentage: 0.95,
    };
  });
  const opts = baseOptions(theme, { xTitle: `${s.name} (1~99 백분위 범위)`, yTitle: '클래스 안 비율 (%)', legend: true });
  opts.plugins!.tooltip!.callbacks = {
    label: (c) => `${c.dataset.label}: ${(c.raw as number).toFixed(1)}% · ${count((c.dataset as unknown as { raw: number[] }).raw[c.dataIndex])}`,
  };
  (opts.scales!.x as { ticks: { maxTicksLimit?: number } }).ticks.maxTicksLimit = 6;
  return (
    <ChartFrame label={`${s.name}의 클래스별 분포`} height={220}>
      <Bar key={theme.key} data={{ labels, datasets }} options={opts} />
    </ChartFrame>
  );
}

/** V-08: 이진 열의 1 비율 분포 (5% 간격) */
export function V08BinaryRatio({ items }: { items: BinarySummary[] }) {
  const theme = useTheme();
  const counts = new Array<number>(20).fill(0);
  for (const b of items) counts[Math.min(19, Math.floor(b.oneRatio * 20))]++;
  const labels = counts.map((_, i) => `${i * 5}~${i * 5 + 5}%`);
  const opts = baseOptions(theme, { xTitle: "값 '1'의 비율", yTitle: '열 수' });
  opts.plugins!.tooltip!.callbacks = { label: (c) => `${c.raw}개 열` };
  return (
    <ChartFrame label="이진 열의 1 비율 분포" height={200}>
      <Bar key={theme.key} data={{ labels, datasets: [{ data: counts, backgroundColor: theme.accent, borderRadius: 2 }] }} options={opts} />
    </ChartFrame>
  );
}
