// V-02 클래스 구성 · V-03 범주형 설명력 · V-04 최강 범주형 · V-05 타깃 연관 상위 · V-09 결측률
import { Bar } from 'react-chartjs-2';
import type { CategoricalSummary, FeatureScore, TargetSummary } from '../../../lib/schema';
import { baseOptions, ChartFrame, count, fmt, pct, refLinePlugin, truncate, useTheme, withAlpha } from './setup';
import styles from './charts.module.css';

/** V-02: 가로 누적 막대 1줄 (HTML). 양성 = 강조색 */
export function V02ClassComposition({ t }: { t: Extract<TargetSummary, { kind: 'classification' }> }) {
  const theme = useTheme();
  const colorOf = (label: string, i: number) =>
    t.positiveClass ? (label === t.positiveClass ? theme.accent : theme.muted) : [theme.accent, theme.series2, theme.muted, theme.negative][i % 4];
  return (
    <div>
      <div className={styles.stack} role="img" aria-label={t.classes.map((c) => `${c.label} ${pct(c.ratio)}`).join(', ')}>
        {t.classes.map((c, i) => (
          <div key={c.label} className={styles.segment} style={{ flexGrow: c.ratio, background: colorOf(c.label, i) }} title={`${c.label}: ${pct(c.ratio)} · ${count(c.count)}`} />
        ))}
      </div>
      <ul className={styles.legend}>
        {t.classes.map((c, i) => (
          <li key={c.label}>
            <span className={styles.swatch} style={{ background: colorOf(c.label, i) }} />
            <strong>{c.label}</strong> {pct(c.ratio)} · {count(c.count)}
            {c.label === t.positiveClass && <span className={styles.tag}>양성</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** V-03: 범주형 설명력 (η² 또는 V), 상위 20개, 최상위만 진한 색 */
export function V03CategoricalStrength({ items }: { items: CategoricalSummary[] }) {
  const theme = useTheme();
  const sorted = items.filter((c) => c.score !== null).sort((a, b) => b.score! - a.score!);
  const top = sorted.slice(0, 20);
  if (!top.length) return null;
  const metric = top[0].metric === 'eta2' ? 'η²' : "Cramér's V";
  const opts = baseOptions(theme, { horizontal: true, xTitle: metric });
  opts.plugins!.tooltip!.callbacks = { title: (c) => top[c[0].dataIndex].name, label: (c) => `${metric} ${(c.raw as number).toFixed(3)} · 범주 ${top[c.dataIndex].nunique}개` };
  (opts.scales!.y as { ticks: { callback?: unknown } }).ticks.callback = (_: unknown, i: number) => truncate(top[i].name);
  return (
    <>
      <ChartFrame label={`범주형 설명력 ${metric}, 1위 ${top[0].name}`} height={Math.max(140, top.length * 26 + 50)}>
        <Bar key={theme.key} data={{ labels: top.map((c) => c.name), datasets: [{ data: top.map((c) => c.score), backgroundColor: top.map((_, i) => (i === 0 ? theme.accent : theme.muted)), borderRadius: 4 }] }} options={opts} />
      </ChartFrame>
      {sorted.length > 20 && <p className={styles.more}>외 {sorted.length - 20}개</p>}
    </>
  );
}

/** V-04: 회귀는 떠 있는 막대 박스플롯(중앙값 순), 분류는 양성 비율 막대(내림차순) */
export function V04CategoryBreakdown({ c, baseline, isRate, targetLabel }: { c: CategoricalSummary; baseline: number; isRate: boolean; targetLabel: string }) {
  const theme = useTheme();
  const levels = c.levels;
  const labels = levels.map((l) => l.label);
  const regression = levels.some((l) => l.box);
  const opts = baseOptions(theme, { xTitle: c.name, yTitle: isRate ? `${targetLabel} (%)` : targetLabel });
  (opts.scales!.x as { ticks: { callback?: unknown; autoSkip?: boolean } }).ticks.callback = (_: unknown, i: number) => truncate(labels[i]);
  if (regression) {
    const datasets = [
      {
        label: 'Q1~Q3',
        data: levels.map((l) => (l.box ? [l.box.q1, l.box.q3] : null)) as unknown as number[],
        backgroundColor: levels.map((l) => (l.count < 30 ? withAlpha(theme.accent, 0.35) : withAlpha(theme.accent, 0.75))),
        borderRadius: 2,
      },
      {
        label: '수염 (1.5·IQR)',
        data: levels.map((l) => (l.box ? [l.box.lo, l.box.hi] : null)) as unknown as number[],
        backgroundColor: theme.text3,
        barPercentage: 0.08,
        grouped: false,
      },
    ];
    opts.plugins!.tooltip!.callbacks = {
      title: (items) => labels[items[0].dataIndex],
      label: (ctx) => {
        const l = levels[ctx.dataIndex];
        return ctx.datasetIndex === 0 && l.box ? `중앙값 ${fmt(l.box.med)} · Q1 ${fmt(l.box.q1)} · Q3 ${fmt(l.box.q3)} · ${count(l.count)}` : '';
      },
    };
    return (
      <>
        <ChartFrame label={`${c.name} 범주별 ${targetLabel} 박스플롯 (중앙값 순)`} height={280}>
          <Bar key={theme.key} data={{ labels, datasets: [datasets[1], datasets[0]] }} options={opts} plugins={[refLinePlugin(baseline, `전체 평균 ${fmt(baseline)}`, theme)]} />
        </ChartFrame>
        {c.otherLevels > 0 && <p className={styles.more}>외 {c.otherLevels}개 범주 ({count(c.otherCount)})</p>}
      </>
    );
  }
  const base = isRate ? baseline * 100 : baseline;
  const values = levels.map((l) => (l.value === null ? null : isRate ? l.value * 100 : l.value));
  opts.plugins!.tooltip!.callbacks = {
    title: (items) => labels[items[0].dataIndex],
    label: (ctx) => `${targetLabel} ${isRate ? pct(levels[ctx.dataIndex].value) : fmt(levels[ctx.dataIndex].value)} · ${count(levels[ctx.dataIndex].count)}`,
  };
  const colors = levels.map((l, i) => {
    const col = values[i] !== null && values[i]! >= base ? theme.accent : theme.muted;
    return l.count < 30 ? withAlpha(col, 0.35) : col;
  });
  return (
    <>
      <ChartFrame label={`${c.name} 범주별 ${targetLabel}`} height={260}>
        <Bar key={theme.key} data={{ labels, datasets: [{ data: values, backgroundColor: colors, borderRadius: 4 }] }} options={opts} plugins={[refLinePlugin(base, `전체 ${isRate ? `${base.toFixed(1)}%` : fmt(base)}`, theme)]} />
      </ChartFrame>
      {c.otherLevels > 0 && <p className={styles.more}>외 {c.otherLevels}개 범주 ({count(c.otherCount)})</p>}
    </>
  );
}

const METRIC_LABEL = { r: 'r', eta2: 'η²', cramersV: 'V' } as const;

/** V-05: 타깃 연관 상위 15개. 양의 상관 = 강조색, 음의 상관 = 보조색, 부호 없는 지표(η²·V) = 강조색 */
export function V05TopFeatures({ items }: { items: FeatureScore[] }) {
  const theme = useTheme();
  const top = items.slice(0, 15);
  if (!top.length) return null;
  const opts = baseOptions(theme, { horizontal: true, xTitle: '연관도 (r, η², V)' });
  opts.plugins!.tooltip!.callbacks = { title: (c) => top[c[0].dataIndex].name, label: (c) => `${METRIC_LABEL[top[c.dataIndex].metric]} = ${(c.raw as number).toFixed(3)} (${top[c.dataIndex].type})` };
  (opts.scales!.y as { ticks: { callback?: unknown } }).ticks.callback = (_: unknown, i: number) => `${truncate(top[i].name)} (${METRIC_LABEL[top[i].metric]})`;
  return (
    <>
      <ChartFrame label={`타깃 연관 상위 변수, 1위 ${top[0].name}`} height={Math.max(160, top.length * 26 + 50)}>
        <Bar key={theme.key} data={{ labels: top.map((f) => f.name), datasets: [{ data: top.map((f) => f.score), backgroundColor: top.map((f) => (f.score < 0 ? theme.negative : theme.accent)), borderRadius: 4 }] }} options={opts} />
      </ChartFrame>
      <p className={styles.legendNote}>
        <span className={styles.swatch} style={{ background: theme.accent }} /> 양의 연관
        <span className={styles.swatch} style={{ background: theme.negative, marginLeft: 12 }} /> 음의 상관
      </p>
    </>
  );
}

/** V-09: 결측률 상위 20열 */
export function V09Missing({ items }: { items: { name: string; ratio: number }[] }) {
  const theme = useTheme();
  if (!items.length) return null;
  const opts = baseOptions(theme, { horizontal: true, xTitle: '결측률 (%)' });
  opts.plugins!.tooltip!.callbacks = { label: (c) => `${(c.raw as number).toFixed(1)}%` };
  return (
    <ChartFrame label="열별 결측률" height={Math.max(120, items.length * 24 + 50)}>
      <Bar key={theme.key} data={{ labels: items.map((m) => truncate(m.name)), datasets: [{ data: items.map((m) => m.ratio * 100), backgroundColor: items.map((m) => (m.ratio >= 0.3 ? theme.warn : theme.muted)), borderRadius: 4 }] }} options={opts} />
    </ChartFrame>
  );
}
