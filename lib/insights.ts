// 6장 자동 인사이트 규칙 R-01 ~ R-15, 추가 규칙 R-16(중복 행)·R-17(순서형 클래스)
import type { Insight, ResultBody, Severity } from './schema';
import { strength } from './analyze/relations';

const ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2, info: 3 };

export const fmtNum = (v: number, digits = 2) =>
  v.toLocaleString('ko-KR', { maximumFractionDigits: Math.abs(v) >= 100 ? 1 : digits });
export const fmtPct = (v: number, digits = 1) => `${(v * 100).toFixed(digits)}%`;

export function buildInsights(r: Omit<ResultBody, 'insights'>): Insight[] {
  const out: Insight[] = [];
  const add = (rule: string, severity: Severity, text: string, columns: string[], section: string) =>
    out.push({ rule, severity, text, columns, section });
  const fmtTarget = (v: number) => (r.task === 'binary' ? fmtPct(v) : fmtNum(v));

  // R-01 · R-02 누수
  for (const l of r.leakage) {
    if (l.reason === 'single_auc')
      add('R-01', 'high', `'${l.name}' 하나로 타깃을 거의 맞힙니다 (AUC ${l.score?.toFixed(3)}). 예측 시점에 알 수 없는 값이면 빼야 합니다.`, [l.name], 'leakage');
    else if (l.reason === 'single_r2')
      add('R-01', 'high', `'${l.name}' 하나로 타깃 분산의 ${fmtPct(l.score ?? 0)}를 설명합니다 (R² ${l.score?.toFixed(3)}). 예측 시점에 알 수 없는 값이면 빼야 합니다.`, [l.name], 'leakage');
    else
      add('R-02', 'high', `'${l.name}'은 결과가 정해진 뒤 기록되는 값일 수 있습니다. 타깃 연관 상위 변수(${l.score !== null ? `${l.score.toFixed(3)}` : ''})이니 정보 누수인지 확인하세요.`, [l.name], 'leakage');
  }

  // R-03 시간 변화
  if (r.timeline && r.timeline.ratio !== null && r.timeline.ratio >= 2) {
    const bins = r.timeline.bins.filter((b) => Number.isFinite(b));
    const min = Math.min(...bins);
    const max = Math.max(...bins);
    const first = r.timeline.bins[0];
    const last = r.timeline.bins[r.timeline.bins.length - 1];
    add(
      'R-03',
      'high',
      `행 순서에 따라 타깃 평균이 ${fmtTarget(min)}에서 ${fmtTarget(max)}로 바뀝니다 (5등분 구간, 처음 ${fmtTarget(first)} → 마지막 ${fmtTarget(last)}). 시간 순서 분할로도 검증하세요.`,
      r.target ? [r.target] : [],
      'timeline',
    );
  }

  // R-04 불균형
  const ts = r.targetSummary;
  if (ts?.kind === 'classification' && ts.minorityRatio < 0.2) {
    const text =
      r.task === 'binary'
        ? `양성('${ts.positiveClass}') 비율이 ${fmtPct(ts.baseline)}입니다. 정확도 대신 ROC-AUC·PR-AUC로 평가하고 계층화 K-fold를 쓰세요.`
        : `가장 적은 클래스 비율이 ${fmtPct(ts.minorityRatio)}입니다. 정확도 대신 macro-F1로 평가하고 계층화 K-fold를 쓰세요.`;
    add('R-04', 'medium', text, r.target ? [r.target] : [], 'target');
  }

  // R-05 단독 이상치
  if (ts?.kind === 'regression' && ts.loneOutlier) {
    const o = ts.loneOutlier;
    add('R-05', 'medium', `최댓값 ${fmtNum(o.value)}${o.id ? `(ID ${o.id})` : ''}은 두 번째 값보다 ${fmtNum(o.gap)} 큽니다. 학습에서 빼거나 상한을 두세요.`, [r.target!], 'target');
  }

  // R-06 왜도
  if (ts?.kind === 'regression' && (ts.stats.skew ?? 0) > 1)
    add('R-06', 'medium', `타깃 '${r.target}'의 왜도가 ${ts.stats.skew!.toFixed(2)}입니다. log 변환한 값으로도 학습해 보세요.`, [r.target!], 'target');
  const skewed = r.numeric.filter((n) => (n.stats.skew ?? 0) > 1).sort((a, b) => b.stats.skew! - a.stats.skew!);
  if (skewed.length)
    add(
      'R-06',
      'low',
      `오른쪽으로 긴 꼬리를 가진 수치형 ${skewed.length}개: ${skewed.slice(0, 6).map((n) => `${n.name}(${n.stats.skew!.toFixed(2)})`).join(', ')}${skewed.length > 6 ? ' 등' : ''}. 선형 모델이라면 log1p 변환이나 상한 처리를 검토하세요.`,
      skewed.map((n) => n.name),
      'numeric',
    );

  // R-07 상수·중복 열
  const a = r.quality.constant.length;
  const b = r.quality.duplicates.length;
  if (a + b >= 1) {
    const before = r.columns.filter((c) => c.name !== r.target && c.type !== 'id').length;
    const dropped = new Set([...r.quality.constant, ...r.quality.duplicates.map((d) => d[0])]);
    dropped.delete(r.target ?? '');
    add('R-07', 'medium', `상수 ${a}개와 중복 ${b}개를 지우면 변수가 ${before}개에서 ${before - dropped.size}개로 줄어듭니다.`, [...dropped], 'quality');
  }

  // R-08 특수 코드
  for (const s of r.quality.special) {
    const isNum = r.columns.find((c) => c.name === s.name)?.type === 'numeric';
    add(
      'R-08',
      'medium',
      `'${s.name}'의 ${fmtPct(s.ratio)}가 '${s.code}'입니다. ${isNum ? `결측이 아닌 별도 코드이니 '이력 있음' 같은 이진 변수로 바꾸고 원래 값은 따로 다루세요.` : '결측이 아닌 별도 범주로 두거나 이진 변수로 바꾸세요.'}`,
      [s.name],
      'quality',
    );
  }

  // R-09 겹치는 특수 코드
  for (const d of r.quality.specialOverlapDetail)
    add('R-09', 'low', `'${d.a}'의 '${d.codeA}'와 '${d.b}'의 '${d.codeB}'는 ${fmtPct(d.match, 2)} 같은 행입니다. 같은 정보이니 하나만 쓰세요.`, [d.a, d.b], 'quality');

  // R-10 최상위 범주형
  const topCat = [...r.categorical].filter((c) => c.score !== null).sort((x, y) => y.score! - x.score!)[0];
  if (topCat && topCat.score! >= 0.3) {
    const metric = topCat.metric === 'eta2' ? 'η²' : "Cramér's V";
    add(
      'R-10',
      'info',
      `'${topCat.name}'이 가장 중요한 범주형 변수입니다 (${metric} ${topCat.score!.toFixed(3)}). 범주 ${topCat.nunique}개: ${topCat.nunique > 10 ? '많으니 타깃 인코딩을 쓰세요' : '적으니 원-핫 인코딩이면 충분합니다'}.`,
      [topCat.name],
      'categorical',
    );
  }

  // R-11 거의 한 값
  const nearConst = r.categorical.filter((c) => c.topRatio >= 0.99 && c.nunique > 1).map((c) => c.name);
  for (const bsum of r.binary) if (Math.max(bsum.oneRatio, 1 - bsum.oneRatio) >= 0.99) nearConst.push(bsum.name);
  if (nearConst.length)
    add('R-11', 'low', `${nearConst.slice(0, 8).map((n) => `'${n}'`).join(', ')}${nearConst.length > 8 ? ` 외 ${nearConst.length - 8}개` : ''}은 거의 한 값뿐입니다 (최빈값 99% 이상). 제거 후보입니다.`, nearConst, 'quality');

  // R-12 고상관 쌍
  const hc = r.relations.highCorr;
  if (hc.length)
    add(
      'R-12',
      'low',
      `상관이 0.95를 넘는 쌍이 ${hc.length}개입니다 (예: ${hc.slice(0, 3).map((p) => `${p.a}–${p.b} r = ${p.r.toFixed(3)}`).join(', ')}). 선형 모델이라면 한쪽만 남기세요.`,
      [...new Set(hc.flatMap((p) => [p.a, p.b]))],
      'relations',
    );

  // R-13 변수 많음
  const nFeatures = r.columns.filter((c) => c.name !== r.target && c.type !== 'id').length;
  if (nFeatures > 50) add('R-13', 'info', `변수가 ${nFeatures}개입니다. 트리 모델과 PCA·SVD 성분 추가를 검토하세요.`, [], 'relations');

  // R-14 결측
  for (const m of r.quality.missing.filter((x) => x.ratio >= 0.3))
    add('R-14', 'medium', `'${m.name}'의 결측이 ${fmtPct(m.ratio)}입니다. ${m.ratio >= 0.7 ? '제거를 권장합니다.' : '결측 여부 지시 변수를 만들거나 제거하세요.'}`, [m.name], 'quality');

  // R-16 중복 행 (명세 6장에 없는 추가 규칙)
  const dupRatio = r.overview.duplicateRows / Math.max(1, r.overview.rows);
  if (r.overview.duplicateRows > 0)
    add(
      'R-16',
      dupRatio >= 0.01 ? 'medium' : 'low',
      `완전히 같은 행이 ${r.overview.duplicateRows.toLocaleString('ko-KR')}개(${fmtPct(dupRatio)}) 있습니다. 실제로 반복된 관측인지 확인하고, 아니라면 지우세요. 그대로 두면 교차검증에서 같은 행이 학습·검증에 함께 들어가 점수가 부풀려집니다.`,
      [],
      'overview',
    );

  // R-17 순서가 있는 숫자 클래스 (추가 규칙)
  if (r.task === 'multiclass' && ts?.kind === 'classification' && ts.classes.every((c) => /^[+-]?\d+(\.\d+)?$/.test(c.label)))
    add(
      'R-17',
      'info',
      `'${r.target}'은 ${ts.classes[0].label}~${ts.classes[ts.classes.length - 1].label}처럼 순서가 있는 점수입니다. 작업 막대의 문제 유형을 '회귀'로 바꾸면 구간별 평균과 변수별 영향을 더 쉽게 볼 수 있습니다.`,
      [r.target!],
      'target',
    );

  // R-15 항상
  const top = r.relations.topFeatures.slice(0, 3);
  add(
    'R-15',
    'info',
    r.task === 'none'
      ? '타깃을 고르면 연관 변수와 누수 점검을 볼 수 있습니다.'
      : `K-fold 교차검증으로 평가하세요 (${r.task === 'binary' ? '분류 ROC-AUC' : r.task === 'multiclass' ? '다중 분류 macro-F1·ROC-AUC(OvR)' : '회귀 R²·RMSE'}).${top.length ? ` 연관 상위 변수: ${top.map((f) => `${f.name}(${strength(f).toFixed(3)})`).join(', ')}.` : ''}`,
    [],
    'recommendations',
  );

  return out.sort((x, y) => ORDER[x.severity] - ORDER[y.severity]);
}

/** 같은 열에 여러 '높음' 규칙이 걸리면 하나만 배너에 올린다 */
export function bannerInsights(insights: Insight[]): Insight[] {
  const seen = new Set<string>();
  return insights.filter((i) => {
    if (i.severity !== 'high') return false;
    const key = i.columns.join('|') || i.rule;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
