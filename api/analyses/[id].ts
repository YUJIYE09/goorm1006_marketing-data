import { PatchAnalysisRequestSchema } from '../../lib/schema';
import { clientIp, json, pathParam, readJson, route } from '../../server/http';
import { rateLimit } from '../../server/rate-limit';
import { deleteAnalysis, getAnalysis, reanalyze } from '../../server/service';

// GET /api/analyses/:id
export const GET = route(async (req) => json(await getAnalysis(pathParam(req))));

// PATCH /api/analyses/:id — 타깃·문제 유형·열 유형을 바꿔 다시 분석 (원본이 없으면 410)
export const PATCH = route(async (req) => {
  rateLimit(`analyze:${clientIp(req)}`, 10, 60 * 1000);
  const id = pathParam(req);
  const opts = PatchAnalysisRequestSchema.parse(await readJson(req));
  return json(await reanalyze(id, opts));
});

// DELETE /api/analyses/:id — DB 행과 Blob 원본을 함께 삭제
export const DELETE = route(async (req) => {
  await deleteAnalysis(pathParam(req));
  return new Response(null, { status: 204 });
});
