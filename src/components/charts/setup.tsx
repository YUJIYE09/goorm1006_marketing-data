// Chart.js 공통 설정: 등록, 테마 색 읽기, 기준선 플러그인, 공통 옵션
import { useEffect, useState, type ReactNode } from 'react';
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
  type ChartOptions,
  type Plugin,
} from 'chart.js';

ChartJS.register(BarController, BarElement, LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend, Filler);
ChartJS.defaults.animation = false; // 5.2: 애니메이션 끔

export interface Theme {
  key: string;
  text: string;
  text2: string;
  text3: string;
  grid: string;
  surface: string;
  accent: string;
  accentSoft: string;
  muted: string;
  negative: string;
  warn: string;
  series2: string;
  divergeMid: string;
  font: string;
}

function readTheme(): Theme {
  const s = getComputedStyle(document.documentElement);
  const v = (n: string) => s.getPropertyValue(n).trim();
  const t = {
    text: v('--text'),
    text2: v('--text-2'),
    text3: v('--text-3'),
    grid: v('--border'),
    surface: v('--surface'),
    accent: v('--accent'),
    accentSoft: v('--accent-soft'),
    muted: v('--muted-mark'),
    negative: v('--negative'),
    warn: v('--warn'),
    series2: v('--series-2'),
    divergeMid: v('--diverge-mid'),
    font: v('--font'),
  };
  return { ...t, key: `${t.surface}${t.accent}` };
}

/** 테마가 바뀌면 새 색을 돌려준다 → 차트 key로 써서 다시 그린다 (5.2) */
export function useTheme(): Theme {
  const [theme, setTheme] = useState(readTheme);
  useEffect(() => {
    const update = () => setTheme(readTheme());
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', update);
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      mq.removeEventListener('change', update);
      mo.disconnect();
    };
  }, []);
  return theme;
}

/** 전체 평균 기준선(점선)과 라벨 */
export function refLinePlugin(value: number | null | undefined, label: string, theme: Theme, axis: 'x' | 'y' = 'y'): Plugin {
  return {
    id: 'refLine',
    afterDatasetsDraw(chart) {
      if (value === null || value === undefined || !Number.isFinite(value)) return;
      const scale = chart.scales[axis];
      if (!scale) return;
      const { ctx, chartArea } = chart;
      const px = scale.getPixelForValue(value);
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = theme.text2;
      ctx.beginPath();
      if (axis === 'y') {
        ctx.moveTo(chartArea.left, px);
        ctx.lineTo(chartArea.right, px);
      } else {
        ctx.moveTo(px, chartArea.top);
        ctx.lineTo(px, chartArea.bottom);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = theme.text2;
      ctx.font = `12px ${theme.font}`;
      if (axis === 'y') {
        ctx.textAlign = 'right';
        ctx.fillText(label, chartArea.right - 2, px - 5);
      } else {
        ctx.textAlign = 'left';
        ctx.fillText(label, px + 4, chartArea.top + 10);
      }
      ctx.restore();
    },
  };
}

export const truncate = (s: string, n = 14) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
export const fmt = (v: number | null | undefined, digits = 2) =>
  v === null || v === undefined || !Number.isFinite(v) ? '–' : v.toLocaleString('ko-KR', { maximumFractionDigits: Math.abs(v) >= 100 ? 1 : digits });
export const pct = (v: number | null | undefined, digits = 1) =>
  v === null || v === undefined || !Number.isFinite(v) ? '–' : `${(v * 100).toFixed(digits)}%`;
export const count = (n: number) => `${n.toLocaleString('ko-KR')}건`;

/** 공통 옵션: 얇은 격자, 보조 글자색, 툴팁 */
export function baseOptions(theme: Theme, opts: { horizontal?: boolean; xTitle?: string; yTitle?: string; legend?: boolean } = {}): ChartOptions<'bar'> {
  const axisTitle = (text?: string) => (text ? { display: true, text, color: theme.text2, font: { size: 12 } } : { display: false });
  return {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: opts.horizontal ? 'y' : 'x',
    animation: false,
    plugins: {
      legend: { display: !!opts.legend, labels: { color: theme.text2, boxWidth: 12, boxHeight: 12 } },
      tooltip: {
        backgroundColor: theme.surface,
        titleColor: theme.text,
        bodyColor: theme.text2,
        borderColor: theme.grid,
        borderWidth: 1,
        padding: 10,
      },
    },
    scales: {
      x: {
        grid: { color: opts.horizontal ? theme.grid : 'transparent' },
        border: { color: theme.grid },
        ticks: { color: theme.text3, maxRotation: 0, autoSkip: true },
        title: axisTitle(opts.xTitle),
      },
      y: {
        grid: { color: opts.horizontal ? 'transparent' : theme.grid },
        border: { color: theme.grid },
        ticks: { color: theme.text3 },
        title: axisTitle(opts.yTitle),
      },
    },
  };
}

export function ChartFrame({ label, height = 260, children }: { label: string; height?: number; children: ReactNode }) {
  return (
    <figure role="img" aria-label={label} style={{ margin: 0, height, position: 'relative' }}>
      {children}
    </figure>
  );
}

/** 건수 30 미만 구간은 흐리게 (5.2) */
export function withAlpha(hex: string, alpha: number): string {
  if (!hex.startsWith('#') || hex.length !== 7) return hex;
  const a = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0');
  return hex + a;
}

const RAMP_LIGHT = ['#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#104281', '#0d366b'];
const RAMP_DARK = ['#184f95', '#1c5cab', '#2a78d6', '#5598e7', '#86b6ef', '#b7d3f6', '#cde2fb'];
const CAT_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
const CAT_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];

/** 다중 분류 클래스 색. 숫자 클래스(순서형)는 한 색상의 진하기 순서, 그 밖은 고정 순서 8색 (9번째부터 회색) */
export function classColors(labels: string[], theme: Theme): string[] {
  const dark = theme.surface.toLowerCase() === '#1a1a19';
  if (labels.length && labels.every((l) => /^[+-]?\d+(\.\d+)?$/.test(l))) {
    const ramp = dark ? RAMP_DARK : RAMP_LIGHT;
    const n = labels.length;
    return labels.map((_, i) => ramp[n === 1 ? 3 : Math.round((i * (ramp.length - 1)) / (n - 1))]);
  }
  const cat = dark ? CAT_DARK : CAT_LIGHT;
  return labels.map((_, i) => cat[i] ?? theme.muted);
}
