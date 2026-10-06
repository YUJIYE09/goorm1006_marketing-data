import { describe, expect, it } from 'vitest';
import { detectDelimiter, parseCsv } from '../lib/parse';
import { profileTable } from '../lib/profile';
import { AppError } from '../lib/errors';

const enc = (s: string) => new TextEncoder().encode(s);
const typesOf = (csv: string) => {
  const t = parseCsv(enc(csv));
  return Object.fromEntries(profileTable(t).columns.map((c) => [c.name, c.type]));
};

describe('파싱 경계 사례', () => {
  it.each([
    [',', 'a,b,c\n1,2,3\n'],
    [';', 'a;b;c\n1;2;3\n'],
    ['\t', 'a\tb\tc\n1\t2\t3\n'],
    ['|', 'a|b|c\n1|2|3\n'],
    [';', '"a";"b"\n"x,y";2\n"z,w";3\n'],
  ])('구분자 %j 인식', (d, text) => expect(detectDelimiter(text)).toBe(d));

  it('빈 파일은 이유를 알려 준다', () => {
    expect(() => parseCsv(enc(''))).toThrow(AppError);
    expect(() => parseCsv(enc('   \n'))).toThrow(/비어/);
  });
  it('헤더만 있는 파일', () => expect(() => parseCsv(enc('a,b,c\n'))).toThrow(/데이터 행이 없습니다/));
  it('열 1개', () => {
    const t = parseCsv(enc('x\n1\n2\n3\n'));
    expect(t.headers).toEqual(['x']);
    expect(t.nRows).toBe(3);
  });
  it('따옴표 안 쉼표와 따옴표 제거', () => {
    const t = parseCsv(enc('job,n\n"admin.",1\n"a, b",2\n'));
    expect(t.columns[0]).toEqual(['admin.', 'a, b']);
  });
  it('BOM과 CRLF', () => {
    const t = parseCsv(enc('﻿a,b\r\n1,2\r\n3,4\r\n'));
    expect(t.headers).toEqual(['a', 'b']);
    expect(t.columns[1]).toEqual(['2', '4']);
  });
  it('중복·빈 헤더는 col_N으로 바꾸고 알린다', () => {
    const t = parseCsv(enc('a,a,,b\n1,2,3,4\n'));
    expect(t.headers).toEqual(['a', 'col_2', 'col_3', 'b']);
    expect(t.headerNotes).toHaveLength(2);
  });
  it('한글 열 이름', () => {
    const t = parseCsv(enc('이름,나이\n홍길동,30\n'));
    expect(t.headers).toEqual(['이름', '나이']);
  });
  it('EUC-KR 파일을 다시 읽는다', () => {
    const hex = 'c0ccb8a72cb3aac0cc0ac8abb1e6b5bf2c33300ab1e8c3b6bcf62c34310a';
    const bytes = new Uint8Array(hex.match(/../g)!.map((h) => parseInt(h, 16)));
    const t = parseCsv(bytes);
    expect(t.encoding).toBe('euc-kr');
    expect(t.headers).toEqual(['이름', '나이']);
    expect(t.columns[0]).toEqual(['홍길동', '김철수']);
  });
});

describe('열 유형 판별', () => {
  const rows = (n: number, f: (i: number) => string) => Array.from({ length: n }, (_, i) => f(i)).join('\n');
  it('숫자 열에 ? 몇 개가 섞여도 수치형, ?는 특수 코드', () => {
    const csv = 'v\n' + rows(200, (i) => (i % 100 === 7 ? '?' : String(i * 1.5)));
    const t = parseCsv(enc(csv));
    const c = profileTable(t).columns[0];
    expect(c.type).toBe('numeric');
    expect(c.special['?']).toBe(2);
  });
  it('모두 결측인 열은 상수', () => {
    const t = parseCsv(enc('a,b\n1,NA\n2,\n3,null\n4,-\n'));
    const c = profileTable(t).columns[1];
    expect(c.missing).toBe(4);
    expect(c.constant).toBe(true);
  });
  it('이진: yes/no, 0/1, Y/N', () => {
    expect(typesOf('a,b,c\nyes,0,Y\nno,1,N\nyes,1,Y\n')).toEqual({ a: 'binary', b: 'binary', c: 'binary' });
  });
  it('식별자·수치형·순서형 범주·범주형·날짜·텍스트', () => {
    const csv =
      'id,score,grade,city,date,memo\n' +
      rows(120, (i) => `${i + 1},${(i * 7.3) % 101},${(i % 5) + 1},${['서울', '부산', '대구'][i % 3]},2024-01-${String((i % 28) + 1).padStart(2, '0')},메모 ${i}번`);
    expect(typesOf(csv)).toEqual({ id: 'id', score: 'numeric', grade: 'categorical', city: 'categorical', date: 'date', memo: 'text' });
  });
});
