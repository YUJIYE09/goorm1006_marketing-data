import Papa from 'papaparse';
import { AppError } from './errors';

export type Delimiter = ',' | ';' | '\t' | '|';
const DELIMITERS: Delimiter[] = [',', ';', '\t', '|'];

export interface ParsedTable {
  headers: string[];
  /** 열 단위 원값 (따옴표 제거, 앞뒤 공백 제거) */
  columns: string[][];
  nRows: number;
  delimiter: Delimiter;
  encoding: 'utf-8' | 'euc-kr';
  /** 바뀐 헤더 안내 (F-05) */
  headerNotes: string[];
}

/** UTF-8로 읽고 깨진 문자가 많으면 EUC-KR(CP949)로 다시 읽는다 (F-04) */
export function decode(bytes: Uint8Array): { text: string; encoding: 'utf-8' | 'euc-kr' } {
  let text = new TextDecoder('utf-8').decode(bytes);
  let encoding: 'utf-8' | 'euc-kr' = 'utf-8';
  let bad = 0;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 0xfffd) bad++;
  if (bad > 0 && bad / Math.max(1, text.length) > 0.0005) {
    try {
      const alt = new TextDecoder('euc-kr').decode(bytes);
      let altBad = 0;
      for (let i = 0; i < alt.length; i++) if (alt.charCodeAt(i) === 0xfffd) altBad++;
      if (altBad < bad) {
        text = alt;
        encoding = 'euc-kr';
      }
    } catch {
      // ICU 없는 런타임이면 UTF-8 결과를 그대로 쓴다
    }
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return { text, encoding };
}

/** 따옴표 안을 건너뛰며 줄마다 구분자 개수를 세서 가장 일관된 구분자를 고른다 (F-02) */
export function detectDelimiter(text: string): Delimiter {
  const sample = text.slice(0, 64 * 1024);
  const counts: Record<Delimiter, number[]> = { ',': [], ';': [], '\t': [], '|': [] };
  let cur: Record<Delimiter, number> = { ',': 0, ';': 0, '\t': 0, '|': 0 };
  let inQuote = false;
  let lines = 0;
  for (let i = 0; i < sample.length && lines < 50; i++) {
    const ch = sample[i];
    if (ch === '"') inQuote = !inQuote;
    else if (!inQuote && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && sample[i + 1] === '\n') i++;
      for (const d of DELIMITERS) counts[d].push(cur[d]);
      cur = { ',': 0, ';': 0, '\t': 0, '|': 0 };
      lines++;
    } else if (!inQuote && (DELIMITERS as string[]).includes(ch)) cur[ch as Delimiter]++;
  }
  // 줄바꿈 없이 끝난 마지막 줄
  if (lines < 50 && DELIMITERS.some((d) => cur[d] > 0)) for (const d of DELIMITERS) counts[d].push(cur[d]);
  let best: Delimiter = ',';
  let bestScore = 0;
  for (const d of DELIMITERS) {
    const arr = counts[d].filter((_, i) => i < 50);
    if (!arr.length || arr[0] === 0) continue;
    const head = arr[0];
    const consistent = arr.filter((c) => c === head).length / arr.length;
    const score = consistent * 1000 + head;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

/** 헤더를 정리한다. 빈 칸·중복은 col_N으로 바꾼다 (F-05) */
export function normalizeHeaders(raw: string[]): { headers: string[]; notes: string[] } {
  const seen = new Set<string>();
  const notes: string[] = [];
  const headers = raw.map((h, i) => {
    const name = (h ?? '').trim();
    if (!name || seen.has(name)) {
      let alt = `col_${i + 1}`;
      while (seen.has(alt)) alt += '_';
      notes.push(name ? `중복된 열 이름 '${name}'을 '${alt}'로 바꿨습니다.` : `${i + 1}번째 열의 빈 이름을 '${alt}'로 바꿨습니다.`);
      seen.add(alt);
      return alt;
    }
    seen.add(name);
    return name;
  });
  return { headers, notes };
}

export function parseCsv(input: Uint8Array | string): ParsedTable {
  const { text, encoding } = typeof input === 'string' ? { text: input.replace(/^﻿/, ''), encoding: 'utf-8' as const } : decode(input);
  if (!text.trim()) throw new AppError('PARSE_FAILED', '파일이 비어 있습니다. 내용이 있는 CSV를 올려 주세요.');
  const delimiter = detectDelimiter(text);
  const res = Papa.parse<string[]>(text, { delimiter, skipEmptyLines: 'greedy' });
  const rows = res.data;
  if (!rows.length || !rows[0].some((h) => h && h.trim())) {
    throw new AppError('PARSE_FAILED', '열 이름 행을 찾지 못했습니다. 첫 행에 열 이름이 있는지 확인하세요.');
  }
  const { headers, notes } = normalizeHeaders(rows[0]);
  const nRows = rows.length - 1;
  if (nRows < 1) throw new AppError('PARSE_FAILED', '열 이름 행만 있고 데이터 행이 없습니다.');
  const nCols = headers.length;
  const columns: string[][] = Array.from({ length: nCols }, () => new Array<string>(nRows));
  let ragged = 0;
  for (let r = 0; r < nRows; r++) {
    const row = rows[r + 1];
    if (row.length !== nCols) ragged++;
    for (let c = 0; c < nCols; c++) {
      const v = row[c];
      columns[c][r] = v === undefined ? '' : v.trim();
    }
  }
  if (ragged > nRows * 0.2) {
    throw new AppError(
      'PARSE_FAILED',
      `행의 ${Math.round((ragged / nRows) * 100)}%가 열 개수(${nCols})와 맞지 않습니다. 구분자나 따옴표가 올바른지 확인하세요.`,
    );
  }
  return { headers, columns, nRows, delimiter, encoding, headerNotes: notes };
}
