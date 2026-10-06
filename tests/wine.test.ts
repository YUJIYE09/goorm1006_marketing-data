// 다중 분류 사례: UCI Wine Quality (red, 1,599행, 구분자 ';', 타깃 quality 3~8)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { analyze } from '../lib/analyze';
import { parseCsv } from '../lib/parse';
import { ResultSchema } from '../lib/schema';

const table = parseCsv(new Uint8Array(readFileSync(new URL('./fixtures/winequality-red.csv', import.meta.url))));
const r = analyze({ table, fileName: 'winequality-red.csv' });

describe('winequality-red.csv (다중 분류)', () => {
  it('quality를 다중 분류 타깃으로 고르고 클래스를 숫자 순서로 둔다', () => {
    expect(r.task).toBe('multiclass');
    expect(r.target).toBe('quality');
    const ts = r.targetSummary!;
    if (ts.kind !== 'classification') throw new Error('classification expected');
    expect(ts.classes.map((c) => c.label)).toEqual(['3', '4', '5', '6', '7', '8']);
    expect(ts.classes.find((c) => c.label === '5')!.count).toBe(681);
  });
  it('수치형 연관은 η²로 표시하고 alcohol이 1위', () => {
    const top = r.relations.topFeatures[0];
    expect(top.name).toBe('alcohol');
    expect(top.metric).toBe('eta2');
    expect(Math.sqrt(top.score)).toBeCloseTo(r.numeric.find((n) => n.name === 'alcohol')!.association!, 10);
  });
  it('중복 행 240개(R-16)와 순서형 클래스 안내(R-17)', () => {
    expect(r.overview.duplicateRows).toBe(240);
    expect(r.insights.find((i) => i.rule === 'R-16')!.severity).toBe('medium');
    expect(r.insights.some((i) => i.rule === 'R-17')).toBe(true);
  });
  it('회귀로 바꿔 다시 분석할 수 있다', () => {
    const reg = analyze({ table, fileName: 'x', options: { target: 'quality', task: 'regression' } });
    expect(reg.task).toBe('regression');
    expect(reg.relations.topFeatures[0].name).toBe('alcohol');
    expect(ResultSchema.safeParse(JSON.parse(JSON.stringify({ ...reg, id: 'a', datasetId: 'b' }))).success).toBe(true);
  });
});
