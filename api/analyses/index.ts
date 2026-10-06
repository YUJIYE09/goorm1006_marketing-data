import { AnalysisListSchema, CreateAnalysisRequestSchema } from '../../lib/schema';
import { clientIp, json, readJson, route } from '../../server/http';
import { rateLimit } from '../../server/rate-limit';
import { getRepo } from '../../server/repo';
import { createAnalysis } from '../../server/service';

// POST /api/analyses — Blob에 올린 파일을 파싱·분석·저장
export const POST = route(async (req) => {
  rateLimit(`analyze:${clientIp(req)}`, 10, 60 * 1000);
  const input = CreateAnalysisRequestSchema.parse(await readJson(req));
  const { result, duplicate } = await createAnalysis(input);
  return json(result, duplicate ? 200 : 201, duplicate ? { 'x-duplicate-of': result.id } : {});
});

// GET /api/analyses?page=&limit= — 최근 분석 목록 (최신순)
export const GET = route(async (req) => {
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 20));
  const repo = await getRepo();
  const { items, hasMore } = await repo.list(page, limit);
  return json(AnalysisListSchema.parse({ items, page, limit, hasMore }));
});
