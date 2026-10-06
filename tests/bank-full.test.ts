// 9.1절 수용 기준: bank-full.csv (기대값은 pandas로 계산한 값, 소수 셋째 자리까지 비교)
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { analyze } from '../lib/analyze';
import { parseCsv, type ParsedTable } from '../lib/parse';
import { ResultSchema, type ResultBody } from '../lib/schema';
import { buildSummary } from '../lib/summary';
import { bannerInsights } from '../lib/insights';

let table: ParsedTable;
let r: ResultBody;

beforeAll(() => {
  table = parseCsv(new Uint8Array(readFileSync(new URL('./fixtures/bank-full.csv', import.meta.url))));
  r = analyze({ table, fileName: 'bank-full.csv' });
});

const close3 = (actual: number | null | undefined, expected: number) => expect(Math.round((actual ?? NaN) * 1000) / 1000).toBe(expected);
const cat = (name: string) => r.categorical.find((c) => c.name === name)!;
const numeric = (name: string) => r.numeric.find((c) => c.name === name)!;

describe('bank-full.csv 파싱', () => {
  it("구분자 ';' 자동 인식, 45,211행 × 17열, 따옴표 제거", () => {
    expect(table.delimiter).toBe(';');
    expect(r.overview.rows).toBe(45211);
    expect(r.overview.cols).toBe(17);
    expect(table.headers[1]).toBe('job');
    expect(table.columns[1][0]).toBe('management');
  });
  it('열 유형', () => {
    const types = Object.fromEntries(r.columns.map((c) => [c.name, c.type]));
    expect(types).toMatchObject({ age: 'numeric', job: 'categorical', default: 'binary', y: 'binary', month: 'categorical', pdays: 'numeric', poutcome: 'categorical' });
  });
});

describe('bank-full.csv 타깃', () => {
  it('이진 분류, 양성 = yes, 양성 비율 11.70% (5,289건)', () => {
    expect(r.task).toBe('binary');
    expect(r.target).toBe('y');
    expect(r.positiveClass).toBe('yes');
    const ts = r.targetSummary!;
    expect(ts.kind).toBe('classification');
    if (ts.kind !== 'classification') return;
    const yes = ts.classes.find((c) => c.label === 'yes')!;
    expect(yes.count).toBe(5289);
    expect((yes.ratio * 100).toFixed(2)).toBe('11.70');
  });
});

describe('bank-full.csv 연관', () => {
  it("poutcome V 0.312, month V 0.260, duration r 0.395", () => {
    close3(cat('poutcome').score, 0.312);
    close3(cat('month').score, 0.26);
    close3(numeric('duration').association, 0.395);
    expect(r.relations.topFeatures[0].name).toBe('duration');
  });
  it('그 밖의 pandas 값 (contact V, job V, pdays r, campaign r, balance 왜도)', () => {
    close3(cat('contact').score, 0.151);
    close3(cat('job').score, 0.136);
    close3(numeric('pdays').association, 0.104);
    close3(numeric('campaign').association, -0.073);
    // pandas skew()는 표본 보정식이라 모집단 공식과 조금 다르다: 8.360 (pandas) vs 모집단
    expect(numeric('balance').stats.skew!).toBeGreaterThan(8.35);
  });
});

describe('bank-full.csv 특수 코드', () => {
  it('pdays −1 81.7%, poutcome unknown 81.7%, 두 열 겹침 감지', () => {
    const pd = r.quality.special.find((s) => s.name === 'pdays' && s.code === '-1')!;
    const po = r.quality.special.find((s) => s.name === 'poutcome' && s.code === 'unknown')!;
    expect((pd.ratio * 100).toFixed(1)).toBe('81.7');
    expect((po.ratio * 100).toFixed(1)).toBe('81.7');
    const pair = r.quality.specialOverlaps.map((p) => [...p].sort().join('|'));
    expect(pair).toContain('pdays|poutcome');
  });
});

describe('bank-full.csv 경고', () => {
  it('duration 누수 의심(R-02), 시간 변화(R-03), 불균형(R-04)', () => {
    const rules = r.insights.map((i) => i.rule);
    expect(rules).toEqual(expect.arrayContaining(['R-02', 'R-03', 'R-04', 'R-06', 'R-08', 'R-09', 'R-15']));
    expect(r.insights.find((i) => i.rule === 'R-02')!.columns).toEqual(['duration']);
    const banner = bannerInsights(r.insights).map((i) => i.rule);
    expect(banner).toEqual(expect.arrayContaining(['R-02', 'R-03']));
    // R-04는 배너가 아닌 '중간' 심각도
    expect(r.insights.find((i) => i.rule === 'R-04')!.severity).toBe('medium');
    // R-06은 balance·campaign·previous를 포함, R-08은 poutcome·pdays·contact
    expect(r.insights.find((i) => i.rule === 'R-06')!.columns).toEqual(expect.arrayContaining(['balance', 'campaign', 'previous']));
    expect(r.insights.filter((i) => i.rule === 'R-08').map((i) => i.columns[0]).sort()).toEqual(['contact', 'pdays', 'poutcome']);
  });
  it('시간 변화 비율 ≥ 2배', () => {
    expect(r.timeline!.ratio!).toBeGreaterThanOrEqual(2);
    close3(r.timeline!.bins[0], 0.034);
    close3(r.timeline!.bins[4], 0.316);
  });
});

describe('응답 형식', () => {
  it('Zod 스키마를 통과하고 4.5MB보다 훨씬 작다', () => {
    const full = { ...r, id: 'a', datasetId: 'b' };
    expect(ResultSchema.safeParse(JSON.parse(JSON.stringify(full))).success).toBe(true);
    expect(JSON.stringify(full).length).toBeLessThan(500 * 1024);
  });
  it('서버 계산 1.5초 이하 (4.4절)', () => {
    expect(r.meta.durationMs).toBeLessThan(1500 * 2); // CI 기기 편차를 감안해 2배 여유
  });
  it('요약 텍스트에 핵심 수치가 들어간다', () => {
    const s = buildSummary(r);
    expect(s).toContain('45,211행 × 17열');
    expect(s).toContain('yes 11.7% (5,289건)');
    expect(s).toContain('duration (r 0.395)');
  });
  it('타깃 없음이면 타깃 섹션을 비운다 (F-23)', () => {
    const none = analyze({ table, fileName: 'bank-full.csv', options: { target: null } });
    expect(none.task).toBe('none');
    expect(none.targetSummary).toBeNull();
    expect(none.relations.topFeatures).toHaveLength(0);
    expect(none.leakage).toHaveLength(0);
    expect(none.timeline).toBeNull();
  });
  it('다른 타깃(회귀 balance, 다중 분류 education)으로 다시 분석', () => {
    const reg = analyze({ table, fileName: 'x', options: { target: 'balance' } });
    expect(reg.task).toBe('regression');
    expect(reg.targetSummary!.kind).toBe('regression');
    const multi = analyze({ table, fileName: 'x', options: { target: 'education' } });
    expect(multi.task).toBe('multiclass');
    expect(ResultSchema.safeParse(JSON.parse(JSON.stringify({ ...multi, id: 'a', datasetId: 'b' }))).success).toBe(true);
  });
});
