// 리포트 본문: 개요 → 경고 배너 → 섹션들 (결론 문장 → 차트 → 표 → 해석)
import type { ReactNode } from 'react';
import type { ColType, Result } from '../../../lib/schema';
import { bannerInsights } from '../../../lib/insights';
import { MiniHistogram, V01TargetHistogram, V06NumericBins, V07ClassHist, V08BinaryRatio } from '../charts/Distribution';
import { V02ClassComposition, V03CategoricalStrength, V04CategoryBreakdown, V05TopFeatures, V09Missing } from '../charts/Ranking';
import { DateTrend, V10CorrMatrix, V11Timeline, V12Periodic } from '../charts/Time';
import { count, fmt, pct } from '../charts/setup';
import { SortableTable } from './SortableTable';
import styles from './Report.module.css';

const TYPE_LABEL: Record<ColType, string> = { id: '식별자', numeric: '수치형', binary: '이진', categorical: '범주형', date: '날짜', text: '텍스트' };
const SEV_LABEL = { high: '높음', medium: '중간', low: '낮음', info: '정보' } as const;
const METRIC = { r: 'r', eta2: 'η²', cramersV: 'V' } as const;

export const SECTIONS = [
  ['overview', '개요'],
  ['target', '타깃'],
  ['quality', '품질'],
  ['numeric', '수치형'],
  ['categorical', '범주형'],
  ['relations', '관계'],
  ['timeline', '시간'],
  ['leakage', '누수'],
  ['columns', '열 유형'],
  ['recommendations', '권장 작업'],
] as const;

function Section({ id, kicker, title, children }: { id: string; kicker: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className={styles.section} aria-labelledby={`${id}-h`}>
      <p className={styles.kicker}>{kicker}</p>
      <h2 id={`${id}-h`} className={styles.sectionTitle}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className={styles.tile}>
      <div className={styles.tileLabel}>{label}</div>
      <div className={styles.tileValue}>{value}</div>
      {sub && <div className={styles.tileSub}>{sub}</div>}
    </div>
  );
}

export interface ReportProps {
  r: Result;
  /** 열 유형 수정 (원본이 남아 있을 때만) */
  onChangeType?: (column: string, type: ColType) => void;
  busy?: boolean;
}

export function Report({ r, onChangeType, busy }: ReportProps) {
  const ts = r.targetSummary;
  const isClass = r.task === 'binary' || r.task === 'multiclass';
  const isRate = r.task === 'binary';
  const baseline = ts?.baseline ?? 0;
  const banner = bannerInsights(r.insights);
  const leakNames = new Set(r.leakage.map((l) => l.name));
  const top = r.relations.topFeatures;
  const topNumeric = [...r.numeric].sort((a, b) => Math.abs(b.association ?? 0) - Math.abs(a.association ?? 0));
  const topCat = [...r.categorical].filter((c) => c.score !== null).sort((a, b) => b.score! - a.score!)[0];
  const o = r.overview;
  const q = r.quality;
  const hasTarget = r.task !== 'none';

  // ---- 섹션 제목 (결론 한 문장) ----
  const targetTitle =
    ts?.kind === 'classification'
      ? r.task === 'binary'
        ? `양성('${ts.positiveClass}') 비율은 ${pct(ts.baseline)}${ts.minorityRatio < 0.2 ? '로 불균형합니다' : '입니다'}`
        : `클래스 ${ts.classes.length}개, 가장 적은 클래스는 ${pct(ts.minorityRatio)}입니다`
      : ts?.kind === 'regression'
        ? `'${r.target}'은 평균 ${fmt(ts.stats.mean)}, 중앙값 ${fmt(ts.stats.p50)}${(ts.stats.skew ?? 0) > 1 ? `로 오른쪽 꼬리가 깁니다 (왜도 ${fmt(ts.stats.skew)})` : '입니다'}`
        : '';
  const n0 = topNumeric[0];
  const numericTitle = !r.numeric.length
    ? '수치형 열이 없습니다'
    : hasTarget && n0?.association !== null && n0
      ? `${n0.name}은 ${r.target}와 ${r.task === 'multiclass' ? '상관비' : 'r'} = ${n0.association!.toFixed(2)}로 수치형 중 가장 강합니다${leakNames.has(n0.name) ? '. 하지만 결과가 정해진 뒤 기록되는 값일 수 있습니다' : ''}`
      : `수치형 ${r.numeric.length}개의 분포입니다`;
  const catTitle = !r.categorical.length
    ? '범주형 열이 없습니다'
    : topCat
      ? `${topCat.name}이 가장 설명력이 높은 범주형입니다 (${topCat.metric === 'eta2' ? 'η²' : 'V'} ${topCat.score!.toFixed(3)})`
      : `범주형 ${r.categorical.length}개의 빈도입니다`;
  const qualityTitle = `특수 코드 ${q.special.length}건, 상수 열 ${q.constant.length}개, 중복 열 ${q.duplicates.length}개, 결측 열 ${q.missing.length}개`;
  const tl = r.timeline;
  const tlBins = tl?.bins.filter((b) => Number.isFinite(b)) ?? [];
  const timeTitle = tl
    ? tl.ratio !== null && tl.ratio >= 2
      ? `행 순서에 따라 ${isRate ? '양성 비율' : '타깃 평균'}이 ${isRate ? pct(Math.min(...tlBins)) : fmt(Math.min(...tlBins))}에서 ${isRate ? pct(Math.max(...tlBins)) : fmt(Math.max(...tlBins))}로 바뀝니다`
      : '행 순서에 따른 큰 변화는 없습니다'
    : r.dateTrends.length
      ? `날짜 열 ${r.dateTrends.length}개의 기간별 빈도입니다`
      : '시간 정보가 없습니다';

  return (
    <div className={styles.report} aria-busy={busy}>
      {/* 개요 타일 */}
      <Section id="overview" kicker="개요" title={`${o.rows.toLocaleString('ko-KR')}행 × ${o.cols}열, 결측 셀 ${o.missingCells.toLocaleString('ko-KR')}개, 중복 행 ${o.duplicateRows.toLocaleString('ko-KR')}개`}>
        <div className={styles.tiles}>
          <Tile label="행" value={o.rows.toLocaleString('ko-KR')} sub={r.meta.sampled ? `2변량은 표본 ${r.meta.sampleSize.toLocaleString('ko-KR')}행` : undefined} />
          <Tile label="열" value={String(o.cols)} sub={(Object.entries(o.byType) as [ColType, number][]).filter(([, n]) => n).map(([t, n]) => `${TYPE_LABEL[t]} ${n}`).join(' · ')} />
          <Tile label="결측 셀" value={o.missingCells.toLocaleString('ko-KR')} sub={pct(o.missingCells / (o.rows * o.cols), 2)} />
          <Tile label="중복 행" value={o.duplicateRows.toLocaleString('ko-KR')} />
          {ts?.kind === 'classification' && <Tile label={`타깃 ${r.target}`} value={r.task === 'binary' ? pct(ts.baseline) : `${ts.classes.length}클래스`} sub={r.task === 'binary' ? `양성 '${ts.positiveClass}'` : '다중 분류'} />}
          {ts?.kind === 'regression' && <Tile label={`타깃 ${r.target}`} value={fmt(ts.stats.mean)} sub={`중앙값 ${fmt(ts.stats.p50)} · 회귀`} />}
        </div>
        {r.meta.headerNotes.length > 0 && <p className={styles.note}>{r.meta.headerNotes.join(' ')}</p>}
      </Section>

      {/* 경고 배너 */}
      {banner.length > 0 && (
        <div className={styles.banner} role="alert">
          <strong className={styles.bannerTitle}>⚠ 먼저 확인할 것 {banner.length}건</strong>
          <ul>
            {banner.map((b, i) => (
              <li key={i}>
                <a href={`#${b.section}`}>{b.text}</a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {hasTarget && ts && (
        <Section id="target" kicker="타깃" title={targetTitle}>
          {ts.kind === 'classification' ? (
            <V02ClassComposition t={ts} />
          ) : (
            <>
              <V01TargetHistogram hist={ts.histogram} stats={ts.stats} />
              <div className={styles.statRow}>
                <span>평균 {fmt(ts.stats.mean)}</span>
                <span>표준편차 {fmt(ts.stats.std)}</span>
                <span>왜도 {fmt(ts.stats.skew)}</span>
                <span>첨도 {fmt(ts.stats.kurtosis)}</span>
                <span>IQR 상한 초과 {ts.stats.outliersHigh}개 · 하한 미만 {ts.stats.outliersLow}개</span>
                {ts.loneOutlier && <span className={styles.warnText}>단독 이상치 {fmt(ts.loneOutlier.value)} ({ts.loneOutlier.id ? `ID ${ts.loneOutlier.id}` : `${ts.loneOutlier.row}행`})</span>}
              </div>
            </>
          )}
        </Section>
      )}

      <Section id="quality" kicker="데이터 품질" title={qualityTitle}>
        {q.special.length > 0 && (
          <>
            <h3 className={styles.h3}>특수 코드 (결측과 다른 값)</h3>
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr><th>열</th><th>코드</th><th className="num">건수</th><th className="num">비율</th></tr>
                </thead>
                <tbody>
                  {q.special.map((s) => (
                    <tr key={s.name + s.code}>
                      <td>{s.name}</td><td><code>{s.code}</code></td><td className="num">{s.count.toLocaleString('ko-KR')}</td><td className="num">{pct(s.ratio)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {q.specialOverlapDetail.map((d) => (
              <p key={d.a + d.b} className={styles.note}>
                '{d.a}'의 <code>{d.codeA}</code>와 '{d.b}'의 <code>{d.codeB}</code>는 {pct(d.match, 2)} 같은 행입니다.
              </p>
            ))}
          </>
        )}
        {q.missing.length > 0 ? (
          <>
            <h3 className={styles.h3}>결측률 상위 열</h3>
            <V09Missing items={q.missing} />
          </>
        ) : (
          <p className={styles.note}>결측(빈 칸, NA, NaN, null, -)이 있는 열은 없습니다.</p>
        )}
        <ul className={styles.facts}>
          <li>상수 열: {q.constant.length ? q.constant.join(', ') : '없음'}</li>
          <li>중복 열: {q.duplicates.length ? q.duplicates.slice(0, 20).map(([d, o2]) => `${d} = ${o2}`).join(', ') + (q.duplicates.length > 20 ? ` 외 ${q.duplicates.length - 20}개` : '') : '없음'}</li>
          <li>희귀 이진 열 (소수 값 1% 미만): {q.rare.length ? q.rare.slice(0, 20).join(', ') : '없음'}</li>
          <li>고유값 = 행 수인 열: {q.allUnique.length ? q.allUnique.join(', ') : '없음'}</li>
        </ul>
      </Section>

      <Section id="numeric" kicker="수치형" title={numericTitle}>
        {hasTarget && r.task !== 'multiclass' && topNumeric.slice(0, 6).length > 0 && (
          <div className={styles.grid2}>
            {topNumeric.slice(0, 6).map((s) => (
              <div key={s.name} className={styles.card}>
                <h3 className={styles.h3}>
                  {s.name} <span className={styles.muted}>r = {fmt(s.association, 3)}</span>
                </h3>
                <V06NumericBins s={s} baseline={baseline} isRate={isRate} targetLabel={isRate ? '양성 비율' : `${r.target} 평균`} />
              </div>
            ))}
          </div>
        )}
        {isClass && (
          <div className={styles.grid2}>
            {topNumeric.filter((s) => s.classHist).slice(0, 3).map((s) => (
              <div key={s.name} className={styles.card}>
                <h3 className={styles.h3}>{s.name}: 클래스별 분포</h3>
                <V07ClassHist s={s} positive={r.positiveClass} />
              </div>
            ))}
          </div>
        )}
        {!hasTarget && (
          <div className={styles.grid3}>
            {r.numeric.slice(0, 12).map((s) => (
              <div key={s.name} className={styles.card}>
                <h3 className={styles.h3}>{s.name}</h3>
                <MiniHistogram s={s} />
              </div>
            ))}
          </div>
        )}
        {r.numeric.length > 0 && (
          <SortableTable
            caption="수치형 기술통계"
            rows={r.numeric}
            initialSort={hasTarget ? { key: 'assoc', desc: true } : undefined}
            columns={[
              { key: 'name', label: '열', value: (s) => s.name },
              ...(hasTarget ? [{ key: 'assoc', label: r.task === 'multiclass' ? '상관비' : 'r', num: true, value: (s: (typeof r.numeric)[number]) => (s.association === null ? null : Math.abs(s.association)), render: (s: (typeof r.numeric)[number]) => fmt(s.association, 3) }] : []),
              { key: 'mean', label: '평균', num: true, value: (s) => s.stats.mean, render: (s) => fmt(s.stats.mean) },
              { key: 'std', label: '표준편차', num: true, value: (s) => s.stats.std, render: (s) => fmt(s.stats.std) },
              { key: 'min', label: '최소', num: true, value: (s) => s.stats.min, render: (s) => fmt(s.stats.min) },
              { key: 'p50', label: '중앙값', num: true, value: (s) => s.stats.p50, render: (s) => fmt(s.stats.p50) },
              { key: 'max', label: '최대', num: true, value: (s) => s.stats.max, render: (s) => fmt(s.stats.max) },
              { key: 'skew', label: '왜도', num: true, value: (s) => s.stats.skew, render: (s) => <span className={(s.stats.skew ?? 0) > 1 ? styles.warnText : undefined}>{fmt(s.stats.skew)}</span> },
              { key: 'out', label: 'IQR 밖', num: true, value: (s) => s.stats.outliersHigh + s.stats.outliersLow, render: (s) => (s.stats.outliersHigh + s.stats.outliersLow).toLocaleString('ko-KR') },
              ...(isClass ? [{ key: 'med', label: '클래스별 중앙값', value: (s: (typeof r.numeric)[number]) => s.classMedians.map((m) => `${m.label} ${fmt(m.median)}`).join(' / ') }] : []),
            ]}
          />
        )}
      </Section>

      <Section id="categorical" kicker="범주형" title={catTitle}>
        {hasTarget && r.categorical.length > 0 && (
          <div className={styles.grid2}>
            <div className={styles.card}>
              <h3 className={styles.h3}>범주형 설명력</h3>
              <V03CategoricalStrength items={r.categorical} />
            </div>
            {topCat && r.task !== 'multiclass' && (
              <div className={styles.card}>
                <h3 className={styles.h3}>{topCat.name}: 범주별 {isRate ? '양성 비율' : `${r.target} 분포`}</h3>
                <V04CategoryBreakdown c={topCat} baseline={baseline} isRate={isRate} targetLabel={isRate ? '양성 비율' : r.target ?? ''} />
              </div>
            )}
          </div>
        )}
        {r.categorical.length > 0 && (
          <SortableTable
            caption="범주형 요약"
            rows={r.categorical}
            initialSort={hasTarget ? { key: 'score', desc: true } : undefined}
            columns={[
              { key: 'name', label: '열', value: (c) => c.name },
              { key: 'k', label: '범주 수', num: true, value: (c) => c.nunique },
              ...(hasTarget ? [{ key: 'score', label: r.task === 'regression' ? 'η²' : "Cramér's V", num: true, value: (c: (typeof r.categorical)[number]) => c.score, render: (c: (typeof r.categorical)[number]) => fmt(c.score, 3) }] : []),
              { key: 'top', label: '최빈 범주', value: (c) => c.levels.slice().sort((a, b) => b.count - a.count)[0]?.label ?? '', render: (c) => { const t = c.levels.slice().sort((a, b) => b.count - a.count)[0]; return t ? `${t.label} (${pct(c.topRatio)})` : '–'; } },
              ...(isRate ? [{ key: 'range', label: '범주별 양성 비율 범위', value: (c: (typeof r.categorical)[number]) => { const v = c.levels.map((l) => l.value ?? 0); return Math.max(...v) - Math.min(...v); }, render: (c: (typeof r.categorical)[number]) => { const v = c.levels.filter((l) => l.count >= 30).map((l) => l.value ?? 0); return v.length ? `${pct(Math.min(...v))} ~ ${pct(Math.max(...v))}` : '–'; } }] : []),
            ]}
          />
        )}
        {r.binary.length > 0 && (
          <>
            <h3 className={styles.h3}>이진 피처</h3>
            {r.binary.length >= 10 && <V08BinaryRatio items={r.binary} />}
            <SortableTable
              caption="이진 피처 요약"
              rows={r.binary}
              columns={[
                { key: 'name', label: '열', value: (b) => b.name },
                { key: 'one', label: "'1'로 본 값", value: (b) => b.one },
                { key: 'ratio', label: '1의 비율', num: true, value: (b) => b.oneRatio, render: (b) => pct(b.oneRatio) },
                ...(hasTarget && r.task !== 'multiclass'
                  ? [
                      { key: 'v1', label: isRate ? '1일 때 양성 비율' : '1일 때 타깃 평균', num: true, value: (b: (typeof r.binary)[number]) => b.valueWhenOne, render: (b: (typeof r.binary)[number]) => (isRate ? pct(b.valueWhenOne) : fmt(b.valueWhenOne)) },
                      { key: 'v0', label: isRate ? '0일 때 양성 비율' : '0일 때 타깃 평균', num: true, value: (b: (typeof r.binary)[number]) => b.valueWhenZero, render: (b: (typeof r.binary)[number]) => (isRate ? pct(b.valueWhenZero) : fmt(b.valueWhenZero)) },
                    ]
                  : []),
                ...(hasTarget ? [{ key: 'assoc', label: r.task === 'multiclass' ? 'V' : 'r', num: true, value: (b: (typeof r.binary)[number]) => (b.association === null ? null : Math.abs(b.association)), render: (b: (typeof r.binary)[number]) => fmt(b.association, 3) }] : []),
              ]}
            />
          </>
        )}
        {r.text.length > 0 && (
          <>
            <h3 className={styles.h3}>텍스트 열 (빈도만 표시)</h3>
            <ul className={styles.facts}>
              {r.text.map((t) => (
                <li key={t.name}>
                  <strong>{t.name}</strong> 고유값 {t.nunique.toLocaleString('ko-KR')}개 · 상위: {t.top.slice(0, 5).map((x) => `${x.label} (${x.count})`).join(', ')}
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>

      <Section id="relations" kicker="관계" title={hasTarget && top[0] ? `타깃과 가장 강한 변수는 ${top[0].name} (${METRIC[top[0].metric]} ${top[0].score.toFixed(3)})입니다` : r.relations.highCorr.length ? `상관 0.95를 넘는 쌍이 ${r.relations.highCorr.length}개입니다` : '변수 사이 상관 행렬입니다'}>
        <div className={styles.grid2}>
          {hasTarget && top.length > 0 && (
            <div className={styles.card}>
              <h3 className={styles.h3}>타깃 연관 상위 변수</h3>
              <V05TopFeatures items={top} />
            </div>
          )}
          {r.relations.corrMatrix.labels.length >= 3 && (
            <div className={styles.card}>
              <h3 className={styles.h3}>상관 행렬 (수치·이진 상위 {r.relations.corrMatrix.labels.length}개)</h3>
              <V10CorrMatrix m={r.relations.corrMatrix} />
            </div>
          )}
        </div>
        {r.relations.highCorr.length > 0 && (
          <p className={styles.note}>
            |r| &gt; 0.95: {r.relations.highCorr.slice(0, 10).map((p) => `${p.a}–${p.b} (${p.r.toFixed(3)})`).join(', ')}
            {r.relations.highCorr.length > 10 ? ` 외 ${r.relations.highCorr.length - 10}쌍` : ''}
          </p>
        )}
      </Section>

      <Section id="timeline" kicker="순서·시간" title={timeTitle}>
        {tl && <V11Timeline t={tl} isRate={isRate} targetLabel={isRate ? '양성 비율' : r.target ?? ''} />}
        {tl && (
          <p className={styles.note}>
            5등분 구간 평균: {tl.bins.map((b) => (isRate ? pct(b) : fmt(b))).join(' → ')} (이동평균 창 {tl.window.toLocaleString('ko-KR')}행 = 행 수의 5%)
          </p>
        )}
        {r.periodic.map((p) => (
          <div key={p.name} className={styles.card}>
            <h3 className={styles.h3}>{p.name} 패턴</h3>
            <V12Periodic p={p} isRate={isRate} targetLabel={isRate ? '양성 비율' : r.target ?? ''} baseline={hasTarget && r.task !== 'multiclass' ? baseline : null} />
          </div>
        ))}
        {r.dateTrends.map((d) => (
          <div key={d.name} className={styles.card}>
            <h3 className={styles.h3}>{d.name} 기간별 건수</h3>
            <DateTrend d={d} />
          </div>
        ))}
      </Section>

      {hasTarget && (
        <Section id="leakage" kicker="누수 점검" title={r.leakage.length ? `누수 의심 열 ${r.leakage.length}개: ${r.leakage.map((l) => l.name).join(', ')}` : '단일 변수로 타깃을 거의 맞히는 열은 없습니다'}>
          <p className={styles.note}>
            기준: {isClass ? '단일 변수 AUC ≥ 0.9' : '단일 변수 R² ≥ 0.9'}, 또는 연관 상위 3위 안에서 사후 정보로 보이는 이름 (duration, result, paid, closed 등).
          </p>
          {r.leakage.length > 0 && (
            <ul className={styles.facts}>
              {r.leakage.map((l) => (
                <li key={l.name + l.reason}>
                  <strong>{l.name}</strong>: {l.reason === 'name_hint' ? `이름이 사후 정보 단서이고 연관 상위 (${fmt(l.score, 3)})` : l.reason === 'single_auc' ? `단일 변수 AUC ${fmt(l.score, 3)}` : `단일 변수 R² ${fmt(l.score, 3)}`}
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      <Section id="columns" kicker="열 유형" title={`열 ${o.cols}개의 판별 결과와 근거${onChangeType ? '. 유형을 바꾸면 다시 분석합니다' : ''}`}>
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr><th>열</th><th>유형</th><th className="num">고유값</th><th className="num">결측</th><th>특수 코드</th><th>근거</th></tr>
            </thead>
            <tbody>
              {r.columns.map((c) => (
                <tr key={c.name}>
                  <td>
                    {c.name}
                    {c.name === r.target && <span className={styles.badge}>타깃</span>}
                    {c.constant && <span className={styles.badgeMuted}>상수</span>}
                  </td>
                  <td>
                    {onChangeType ? (
                      <select aria-label={`${c.name} 유형`} value={c.type} disabled={busy} onChange={(e) => onChangeType(c.name, e.target.value as ColType)}>
                        {(Object.keys(TYPE_LABEL) as ColType[]).map((t) => (
                          <option key={t} value={t}>{TYPE_LABEL[t]}</option>
                        ))}
                      </select>
                    ) : (
                      TYPE_LABEL[c.type]
                    )}
                  </td>
                  <td className="num">{c.nunique.toLocaleString('ko-KR')}</td>
                  <td className="num">{c.missing.toLocaleString('ko-KR')}</td>
                  <td>{Object.entries(c.special).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${count(v)}`).join(', ') || '–'}</td>
                  <td className={styles.reason}>{c.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="recommendations" kicker="권장 작업" title={`규칙 ${r.insights.length}개가 걸렸습니다`}>
        <ul className={styles.checklist}>
          {r.insights.map((i, k) => (
            <li key={k} className={styles[`sev_${i.severity}`]}>
              <span className={styles.sev}>{SEV_LABEL[i.severity]}</span>
              <span>{i.text}</span>
              <span className={styles.rule}>{i.rule}</span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
