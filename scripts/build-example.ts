// 첫 화면 예시: Bank Marketing 표본(bank.csv, 4,521행)을 미리 분석해 JSON으로 저장한다.
// 실행: npm run build:example
import { readFileSync, writeFileSync } from 'node:fs';
import { analyze } from '../lib/analyze';
import { parseCsv } from '../lib/parse';
import { ResultSchema } from '../lib/schema';

const table = parseCsv(new Uint8Array(readFileSync('public/samples/bank.csv')));
const body = analyze({ table, fileName: 'bank.csv (UCI Bank Marketing 10% 표본)', sourceAvailable: false });
const result = ResultSchema.parse(JSON.parse(JSON.stringify({ ...body, id: 'example', datasetId: 'example' })));
writeFileSync('src/example/bank-sample.json', JSON.stringify(result));
console.log(`src/example/bank-sample.json ${(JSON.stringify(result).length / 1024).toFixed(1)}KB, 경고 ${result.insights.length}개`);
