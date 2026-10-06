// F-30 요약 복사용 일반 텍스트
import { fmtNum, fmtPct } from './insights';
import type { Result, ResultBody } from './schema';

const TASK_LABEL = { regression: '회귀', binary: '이진 분류', multiclass: '다중 분류', none: '타깃 없음' } as const;
const SEV_LABEL = { high: '높음', medium: '중간', low: '낮음', info: '정보' } as const;

export function buildSummary(r: Result | ResultBody): string {
  const o = r.overview;
  const lines: string[] = [];
  lines.push(`[${r.meta.fileName}] 자동 EDA 요약`);
  lines.push(`규모: ${o.rows.toLocaleString('ko-KR')}행 × ${o.cols}열 (구분자 '${r.meta.delimiter === '\t' ? 'TAB' : r.meta.delimiter}')`);
  const types = Object.entries(o.byType)
    .filter(([, n]) => n > 0)
    .map(([t, n]) => `${t} ${n}`)
    .join(', ');
  lines.push(`열 유형: ${types}`);
  lines.push(`문제 유형: ${TASK_LABEL[r.task]}${r.target ? ` (타깃 '${r.target}')` : ''}`);
  const ts = r.targetSummary;
  if (ts?.kind === 'classification') {
    lines.push(`타깃: ${ts.classes.map((c) => `${c.label} ${fmtPct(c.ratio)} (${c.count.toLocaleString('ko-KR')}건)`).join(' / ')}`);
  } else if (ts?.kind === 'regression') {
    const s = ts.stats;
    lines.push(`타깃: 평균 ${fmtNum(s.mean ?? NaN)}, 중앙값 ${fmtNum(s.p50 ?? NaN)}, 왜도 ${(s.skew ?? 0).toFixed(2)}, IQR 상한 초과 ${s.outliersHigh}개`);
  }
  const q = r.quality;
  lines.push(
    `품질: 결측 셀 ${o.missingCells.toLocaleString('ko-KR')}, 중복 행 ${o.duplicateRows.toLocaleString('ko-KR')}, 상수 열 ${q.constant.length}, 중복 열 ${q.duplicates.length}, 특수 코드 ${q.special.map((s) => `${s.name}=${s.code} ${fmtPct(s.ratio)}`).join(', ') || '없음'}`,
  );
  const top = r.relations.topFeatures.slice(0, 5);
  if (top.length) {
    const label = { r: 'r', eta2: 'η²', cramersV: 'V' } as const;
    lines.push(`연관 상위 5: ${top.map((f) => `${f.name} (${label[f.metric]} ${f.score.toFixed(3)})`).join(', ')}`);
  }
  const warn = r.insights.filter((i) => i.severity === 'high' || i.severity === 'medium');
  if (warn.length) {
    lines.push('경고:');
    for (const w of warn) lines.push(`- [${SEV_LABEL[w.severity]}] ${w.text}`);
  }
  return lines.join('\n');
}
