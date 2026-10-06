import { AppError } from '../lib/errors';

// 인스턴스 메모리 기반의 간단한 고정 창 제한. 서버리스 인스턴스마다 따로 세므로 대략적인 보호다.
// 정확한 제한이 필요하면 Vercel WAF 규칙이나 Upstash 같은 공유 저장소로 바꾼다.
const buckets = new Map<string, { start: number; count: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now - b.start > windowMs) {
    buckets.set(key, { start: now, count: 1 });
    return;
  }
  b.count++;
  if (b.count > limit) throw new AppError('RATE_LIMITED', '요청이 너무 많습니다. 잠시 뒤 다시 시도하세요.');
}
