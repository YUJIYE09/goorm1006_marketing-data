import { describe, expect, it } from 'vitest';
import { aucSymmetric, cramersV, eta2, moments, pearson, quantileSorted } from '../lib/stats';

describe('통계 함수 (작은 수작업 예제)', () => {
  it('분위수는 pandas 선형 보간과 같다', () => {
    const s = new Float64Array([1, 2, 3, 4]);
    expect(quantileSorted(s, 0.5)).toBe(2.5);
    expect(quantileSorted(s, 0.25)).toBe(1.75);
    expect(quantileSorted(s, 1)).toBe(4);
  });
  it('왜도·첨도는 모집단 공식', () => {
    const { skew, kurtosis } = moments([1, 2, 3, 10]);
    // m2 = 12.5, m3 = 45, m4 = 348.5 (손계산)
    expect(skew).toBeCloseTo(45 / 12.5 ** 1.5, 10);
    expect(kurtosis).toBeCloseTo(348.5 / 12.5 ** 2 - 3, 10);
    expect(moments([5, 5, 5]).skew).toBe(0);
  });
  it('피어슨 r은 결측 쌍을 뺀다', () => {
    expect(pearson([1, 2, 3, NaN], [2, 4, 6, 100])).toBeCloseTo(1, 12);
    expect(pearson([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1, 12);
  });
  it('η²', () => {
    // 그룹 0: 1,3 (평균 2), 그룹 1: 5,7 (평균 6), 전체 평균 4
    // SSB = 2·4 + 2·4 = 16, SST = 9+1+1+9 = 20
    expect(eta2([0, 0, 1, 1], [1, 3, 5, 7], 2)).toBeCloseTo(0.8, 12);
  });
  it("Cramér's V", () => {
    // 완전 연관
    expect(cramersV([0, 0, 1, 1], 2, [0, 0, 1, 1], 2)).toBeCloseTo(1, 12);
    // 독립
    expect(cramersV([0, 0, 1, 1], 2, [0, 1, 0, 1], 2)).toBeCloseTo(0, 12);
    // 2x2 표 [[10,20],[30,40]]: χ² = 0.7937 (scipy, 보정 없음), n = 100 → V = 0.0891
    const a: number[] = [];
    const b: number[] = [];
    const push = (x: number, y: number, k: number) => { for (let i = 0; i < k; i++) { a.push(x); b.push(y); } };
    push(0, 0, 10); push(0, 1, 20); push(1, 0, 30); push(1, 1, 40);
    expect(cramersV(a, 2, b, 2)).toBeCloseTo(0.0891, 4);
  });
  it('AUC: 동점은 평균 순위, 0.5 미만이면 뒤집는다', () => {
    expect(aucSymmetric([0.1, 0.4, 0.35, 0.8], [0, 0, 1, 1])).toBeCloseTo(0.75, 12);
    expect(aucSymmetric([1, 1, 1, 1], [0, 1, 0, 1])).toBeCloseTo(0.5, 12);
    expect(aucSymmetric([4, 3, 2, 1], [1, 1, 0, 0])).toBe(1);
  });
});
