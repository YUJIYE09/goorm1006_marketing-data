import { describe, expect, it } from 'vitest';
import { analyze } from '../lib/analyze';
import { parseCsv } from '../lib/parse';

const enc = (s: string) => new TextEncoder().encode(s);
const run = (csv: string, target?: string | null) => analyze({ table: parseCsv(enc(csv)), fileName: 't.csv', options: target === undefined ? {} : { target } });

describe('인사이트 규칙', () => {
  it('R-01: 타깃을 그대로 옮긴 열은 AUC 1로 누수', () => {
    const rows = Array.from({ length: 200 }, (_, i) => `${i % 3 === 0 ? 1 : 0},${i % 3 === 0 ? 1000 + i : i},${i % 7}`);
    const r = run('label,leak,noise\n' + rows.join('\n'));
    expect(r.task).toBe('binary');
    const leak = r.insights.find((i) => i.rule === 'R-01');
    expect(leak?.columns).toEqual(['leak']);
    expect(leak?.severity).toBe('high');
  });
  it('R-05·R-06: 단독 이상치와 타깃 왜도 (회귀)', () => {
    const ys = Array.from({ length: 100 }, (_, i) => 100 + ((i * 37) % 100) * 0.1);
    ys[50] = 400;
    const r = run('x,price\n' + ys.map((y, i) => `${(i * 13) % 17},${y}`).join('\n'));
    expect(r.task).toBe('regression');
    expect(r.insights.some((i) => i.rule === 'R-05')).toBe(true);
    expect(r.insights.some((i) => i.rule === 'R-06' && i.columns[0] === 'price')).toBe(true);
  });
  it('R-07: 상수 열과 중복 열', () => {
    const rows = Array.from({ length: 50 }, (_, i) => `${i},${i % 2},${i % 2},k,${i * 2}`);
    const r = run('a,b,b2,const,y\n' + rows.join('\n'), 'y');
    expect(r.quality.constant).toEqual(['const']);
    expect(r.quality.duplicates).toEqual([['b2', 'b']]);
    expect(r.insights.find((i) => i.rule === 'R-07')!.text).toContain('4개에서 2개로');
  });
  it('R-14: 결측 30% 이상', () => {
    const rows = Array.from({ length: 50 }, (_, i) => `${i},${i % 2 ? '' : i}`);
    const r = run('a,b\n' + rows.join('\n'), null);
    expect(r.insights.find((i) => i.rule === 'R-14')!.columns).toEqual(['b']);
  });
  it('R-15는 항상, 심각도 순으로 정렬', () => {
    const r = run('a,b\n1,2\n3,4\n5,6\n', null);
    expect(r.insights.at(-1)!.rule).toBe('R-15');
    const order = { high: 0, medium: 1, low: 2, info: 3 };
    const sev = r.insights.map((i) => order[i.severity]);
    expect([...sev].sort()).toEqual(sev);
  });
  it('잘못된 타깃은 INVALID_TARGET', () => {
    expect(() => run('a,b\n1,2\n', 'zzz')).toThrow(/찾을 수 없습니다/);
  });
});
