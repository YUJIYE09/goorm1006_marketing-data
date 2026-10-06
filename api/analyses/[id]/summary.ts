import { buildSummary } from '../../../lib/summary';
import { pathParam, route } from '../../../server/http';
import { getAnalysis } from '../../../server/service';

// GET /api/analyses/:id/summary — 요약 복사용 일반 텍스트
export const GET = route(async (req) => {
  const result = await getAnalysis(pathParam(req));
  return new Response(buildSummary(result), { headers: { 'content-type': 'text/plain; charset=utf-8' } });
});
