// API 테스트: 핸들러를 직접 호출한다 (로컬 모드: DATABASE_URL·BLOB_READ_WRITE_TOKEN 없음)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ResultSchema, AnalysisListSchema, ErrorResponseSchema } from '../lib/schema';
import { writeLocalBlob } from '../server/blob';
import * as analyses from '../api/analyses/index';
import * as one from '../api/analyses/[id]';
import * as summary from '../api/analyses/[id]/summary';
import * as health from '../api/health';

const req = (path: string, method = 'GET', body?: unknown) =>
  new Request(`http://test${path}`, { method, headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.0.0.${Math.floor(Math.random() * 250)}` }, body: body === undefined ? undefined : JSON.stringify(body) });

describe('API', () => {
  it('업로드(4.5MB 초과 bank-full.csv) → 생성 → 조회 → 재분석 → 요약 → 삭제', async () => {
    const bytes = new Uint8Array(readFileSync(new URL('./fixtures/bank-full.csv', import.meta.url)));
    expect(bytes.byteLength).toBeGreaterThan(4_500_000) // Vercel 함수 본문 한도 4.5MB;
    // 실행마다 다른 파일이 되도록 공백 줄을 붙인다 (SHA-256 중복 감지 회피)
    const unique = new Uint8Array([...bytes, ...new TextEncoder().encode(' '.repeat(1 + (Date.now() % 9999)) + '\n')]);
    const blobUrl = await writeLocalBlob('bank-full.csv', unique);

    const created = await analyses.POST(req('/api/analyses', 'POST', { blobUrl, fileName: 'bank-full.csv' }));
    expect(created.status).toBe(201);
    const text = await created.text();
    expect(text.length).toBeLessThan(4_500_000);
    const r = ResultSchema.parse(JSON.parse(text));
    expect(r.positiveClass).toBe('yes');

    const got = ResultSchema.parse(await (await one.GET(req(`/api/analyses/${r.id}`))).json());
    expect(got.id).toBe(r.id);

    const patched = ResultSchema.parse(await (await one.PATCH(req(`/api/analyses/${r.id}`, 'PATCH', { target: null }))).json());
    expect(patched.task).toBe('none');

    const s = await (await summary.GET(req(`/api/analyses/${r.id}/summary`))).text();
    expect(s).toContain('45,211행');

    const list = AnalysisListSchema.parse(await (await analyses.GET(req('/api/analyses?page=1&limit=5'))).json());
    expect(list.items.some((i) => i.id === r.id)).toBe(true);

    expect((await one.DELETE(req(`/api/analyses/${r.id}`, 'DELETE'))).status).toBe(204);
    const gone = await one.GET(req(`/api/analyses/${r.id}`));
    expect(gone.status).toBe(404);
    expect(ErrorResponseSchema.parse(await gone.json()).error.code).toBe('NOT_FOUND');
  });

  it('오류는 { error: { code, message } } 형식', async () => {
    const bad = await analyses.POST(req('/api/analyses', 'POST', { fileName: 'x.csv' }));
    expect(bad.status).toBe(400);
    expect(ErrorResponseSchema.parse(await bad.json()).error.code).toBe('INVALID_REQUEST');

    const missing = await analyses.POST(req('/api/analyses', 'POST', { blobUrl: 'local://none', fileName: 'x.csv' }));
    expect(missing.status).toBe(410);

    const parse = await analyses.POST(req('/api/analyses', 'POST', { blobUrl: await writeLocalBlob('h.csv', new TextEncoder().encode('a,b\n')), fileName: 'h.csv' }));
    expect(parse.status).toBe(422);
    expect((await parse.json()).error.code).toBe('PARSE_FAILED');
  });

  it('health는 저장소 모드를 알려 준다', async () => {
    const h = await (await health.GET(req('/api/health'))).json();
    expect(h).toEqual({ ok: true, storage: { db: 'local', blob: 'local' } });
  });
});
