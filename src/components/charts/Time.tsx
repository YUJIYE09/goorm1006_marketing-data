// V-10 상관 행렬 · V-11 순서·시간 추이 · V-12 월·요일 패턴
import { Bar, Line } from 'react-chartjs-2';
import type { Result } from '../../../lib/schema';
import { baseOptions, ChartFrame, count, fmt, pct, refLinePlugin, truncate, useTheme, withAlpha } from './setup';
import styles from './charts.module.css';

/** V-10: 히트맵 (HTML 표). 파랑 = 양, 빨강 = 음, 0 = 회색 */
export function V10CorrMatrix({ m }: { m: Result['relations']['corrMatrix'] }) {
  const theme = useTheme();
  if (m.labels.length < 3) return null;
  const cell = (v: number | null) => {
    if (v === null) return { background: theme.divergeMid, color: theme.text3 };
    const a = Math.min(1, Math.abs(v));
    const base = v >= 0 ? theme.accent : theme.negative;
    return { background: a < 0.05 ? theme.divergeMid : withAlpha(base, 0.12 + a * 0.88), color: a > 0.55 ? '#ffffff' : theme.text };
  };
  return (
    <div className={styles.scrollX}>
      <table className={styles.heatmap} aria-label="상관 행렬">
        <thead>
          <tr>
            <th />
            {m.labels.map((l) => (
              <th key={l} title={l} className={styles.heatCol}>
                <span>{truncate(l, 10)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {m.values.map((row, i) => (
            <tr key={m.labels[i]}>
              <th title={m.labels[i]}>{truncate(m.labels[i], 12)}</th>
              {row.map((v, j) => (
                <td key={j} style={cell(v)} title={`${m.labels[i]} × ${m.labels[j]}: r = ${v === null ? '–' : v.toFixed(3)}`}>
                  {v === null ? '–' : v.toFixed(2)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** V-11: 행 순서에 따른 이동평균 + 전체 평균 점선 */
export function V11Timeline({ t, isRate, targetLabel }: { t: NonNullable<Result['timeline']>; isRate: boolean; targetLabel: string }) {
  const theme = useTheme();
  const k = isRate ? 100 : 1;
  const opts = baseOptions(theme, { xTitle: '행 번호 (파일 순서)', yTitle: isRate ? `${targetLabel} 이동평균 (%)` : `${targetLabel} 이동평균` }) as unknown as import('chart.js').ChartOptions<'line'>;
  opts.plugins!.tooltip!.callbacks = { title: (c) => `${Number(c[0].label).toLocaleString('ko-KR')}행까지 ${t.window.toLocaleString('ko-KR')}행`, label: (c) => `${targetLabel} ${isRate ? pct(t.value[c.dataIndex]) : fmt(t.value[c.dataIndex])}` };
  opts.interaction = { mode: 'index', intersect: false };
  (opts.scales!.x as { ticks: { maxTicksLimit?: number; callback?: unknown } }).ticks.maxTicksLimit = 6;
  (opts.scales!.x as { ticks: { callback?: unknown } }).ticks.callback = (_: unknown, i: number) => t.index[i]?.toLocaleString('ko-KR');
  return (
    <ChartFrame label={`행 순서에 따른 ${targetLabel} 이동평균`} height={240}>
      <Line
        key={theme.key}
        data={{ labels: t.index, datasets: [{ data: t.value.map((v) => v * k), borderColor: theme.accent, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.2 }] }}
        options={opts}
        plugins={[refLinePlugin(t.baseline * k, `전체 ${isRate ? pct(t.baseline) : fmt(t.baseline)}`, theme)]}
      />
    </ChartFrame>
  );
}

/** V-12: 월·요일 패턴. 이중 축 대신 건수와 타깃 평균을 위아래 두 차트로 나눈다 */
export function V12Periodic({ p, isRate, targetLabel, baseline }: { p: Result['periodic'][number]; isRate: boolean; targetLabel: string; baseline: number | null }) {
  const theme = useTheme();
  const labels = p.levels.map((l) => l.label);
  const countOpts = baseOptions(theme, { yTitle: '건수' });
  countOpts.plugins!.tooltip!.callbacks = { label: (c) => count(c.raw as number) };
  const hasValue = p.levels.some((l) => l.value !== null);
  const k = isRate ? 100 : 1;
  const rateOpts = baseOptions(theme, { yTitle: isRate ? `${targetLabel} (%)` : targetLabel });
  rateOpts.plugins!.tooltip!.callbacks = { label: (c) => `${targetLabel} ${isRate ? pct(p.levels[c.dataIndex].value) : fmt(p.levels[c.dataIndex].value)} · ${count(p.levels[c.dataIndex].count)}` };
  return (
    <div className={styles.pair}>
      <ChartFrame label={`${p.name}별 건수`} height={180}>
        <Bar key={theme.key} data={{ labels, datasets: [{ data: p.levels.map((l) => l.count), backgroundColor: theme.muted, borderRadius: 4 }] }} options={countOpts} />
      </ChartFrame>
      {hasValue && (
        <ChartFrame label={`${p.name}별 ${targetLabel}`} height={180}>
          <Bar
            key={theme.key + 'v'}
            data={{ labels, datasets: [{ data: p.levels.map((l) => (l.value === null ? null : l.value * k)), backgroundColor: p.levels.map((l) => ((l.value ?? 0) >= (baseline ?? 0) ? theme.accent : theme.muted)).map((c, i) => (p.levels[i].count < 30 ? withAlpha(c, 0.35) : c)), borderRadius: 4 }] }}
            options={rateOpts}
            plugins={[refLinePlugin(baseline === null ? null : baseline * k, `전체 ${isRate ? pct(baseline) : fmt(baseline)}`, theme)]}
          />
        </ChartFrame>
      )}
    </div>
  );
}

/** 날짜 열 기간별 건수 */
export function DateTrend({ d }: { d: Result['dateTrends'][number] }) {
  const theme = useTheme();
  const opts = baseOptions(theme, { yTitle: '건수' });
  opts.plugins!.tooltip!.callbacks = { label: (c) => count(c.raw as number) };
  return (
    <ChartFrame label={`${d.name} 기간별 건수`} height={200}>
      <Bar key={theme.key} data={{ labels: d.periods.map((p) => p.label), datasets: [{ data: d.periods.map((p) => p.count), backgroundColor: theme.accent, borderRadius: 2 }] }} options={opts} />
    </ChartFrame>
  );
}
