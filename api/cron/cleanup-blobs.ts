import { AppError } from '../../lib/errors';
import { json, route } from '../../server/http';
import { cleanupExpired } from '../../server/service';

// 매시간 실행: 24시간 지난 원본 CSV를 지우고 blob_url을 null로 (F-43)
export const GET = route(async (req) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) throw new AppError('NOT_FOUND', 'Not found');
  if (!secret && process.env.VERCEL_ENV === 'production') throw new AppError('INTERNAL', 'CRON_SECRET이 설정되지 않았습니다.');
  const deleted = await cleanupExpired();
  return json({ deleted });
});
