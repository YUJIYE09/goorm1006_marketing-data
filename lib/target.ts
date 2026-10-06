import { AppError } from './errors';
import type { Column, Profile } from './profile';
import type { Task } from './schema';

const TARGET_NAMES = ['y', 'target', 'label', 'class', 'outcome', 'price'];
const POSITIVE = ['yes', '1', 'true', 'positive', 'y', 't', '1.0'];

/** F-20: 이름 우선, 없으면 마지막 열 (식별자·텍스트·날짜 제외) */
export function guessTarget(profile: Profile): string | null {
  const usable = profile.columns.filter((c) => c.type !== 'id' && c.type !== 'text' && c.type !== 'date' && !c.constant);
  for (const name of TARGET_NAMES) {
    const hit = usable.find((c) => c.name.toLowerCase() === name);
    if (hit) return hit.name;
  }
  const last = profile.columns[profile.columns.length - 1];
  return last && usable.includes(last) && inferTask(last) !== 'none' ? last.name : null;
}

/** F-21: 수치형(고유값 > 15) → 회귀, 이진 → 이진 분류, 고유값 3~15 → 다중 분류 */
export function inferTask(col: Column): Task {
  if (col.type === 'numeric') return 'regression';
  if (col.type === 'binary') return 'binary';
  if (col.type === 'categorical' && col.nunique >= 3 && col.nunique <= 15) return 'multiclass';
  return 'none';
}

/** F-22: yes·1·true·positive 우선, 아니면 소수 클래스 */
export function choosePositive(levels: string[], counts: number[]): string {
  for (const p of POSITIVE) {
    const hit = levels.find((l) => l.toLowerCase() === p);
    if (hit !== undefined) return hit;
  }
  return counts[0] <= counts[1] ? levels[0] : levels[1];
}

export interface TargetVector {
  name: string;
  task: Exclude<Task, 'none'>;
  column: Column;
  /** 회귀: 값, 이진: 0/1, 다중: 클래스 코드. 결측은 NaN */
  y: Float64Array;
  classes: string[];
  positiveClass: string | null;
}

export function buildTarget(profile: Profile, name: string, taskOverride?: Task): TargetVector {
  const col = profile.columns.find((c) => c.name === name);
  if (!col) throw new AppError('INVALID_TARGET', `'${name}' 열을 찾을 수 없습니다.`);
  if (col.constant) throw new AppError('INVALID_TARGET', `'${name}'은 값이 하나뿐이라 타깃으로 쓸 수 없습니다.`);
  let task = taskOverride && taskOverride !== 'none' ? taskOverride : inferTask(col);
  if (task === 'none') {
    throw new AppError('INVALID_TARGET', `'${name}'은 ${col.type === 'id' ? '식별자' : `고유값 ${col.nunique}개인 ${col.type}`} 열이라 타깃으로 쓸 수 없습니다. 문제 유형을 직접 지정하세요.`);
  }
  const n = profile.nRows;
  const y = new Float64Array(n);
  if (task === 'regression') {
    let ok = 0;
    for (let i = 0; i < n; i++) if (!Number.isNaN(col.num[i])) ok++;
    if (ok < (n - col.missing) * 0.9) throw new AppError('INVALID_TARGET', `'${name}'은 숫자가 아닌 값이 많아 회귀 타깃으로 쓸 수 없습니다.`);
    y.set(col.num);
    return { name, task, column: col, y, classes: [], positiveClass: null };
  }
  // 분류: 범주 코드 기준. 수치형을 분류로 바꾼 경우 값 문자열로 코드화
  let levels = col.levels;
  let counts = col.counts;
  let codes = col.codes;
  if (!codes) {
    const freq = new Map<string, number>();
    const keys: string[] = new Array(n);
    for (let i = 0; i < n; i++) {
      const v = col.num[i];
      keys[i] = Number.isNaN(v) ? '' : String(v);
      if (keys[i]) freq.set(keys[i], (freq.get(keys[i]) ?? 0) + 1);
    }
    const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]);
    levels = sorted.map((e) => e[0]);
    counts = sorted.map((e) => e[1]);
    const lookup = new Map(levels.map((l, i) => [l, i]));
    codes = new Int32Array(n);
    for (let i = 0; i < n; i++) codes[i] = keys[i] ? lookup.get(keys[i])! : -1;
  }
  if (levels.length > 50) throw new AppError('INVALID_TARGET', `'${name}'은 클래스가 ${levels.length}개라 분류 타깃으로 쓰기 어렵습니다.`);
  if (task === 'binary' && levels.length !== 2) task = 'multiclass';
  if (task === 'binary') {
    const pos = choosePositive(levels, counts);
    const posCode = levels.indexOf(pos);
    for (let i = 0; i < n; i++) y[i] = codes[i] < 0 ? NaN : codes[i] === posCode ? 1 : 0;
    return { name, task, column: col, y, classes: levels, positiveClass: pos };
  }
  for (let i = 0; i < n; i++) y[i] = codes[i] < 0 ? NaN : codes[i];
  return { name, task: 'multiclass', column: col, y, classes: levels, positiveClass: null };
}
