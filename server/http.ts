import { ZodError } from 'zod';
import { AppError, ERROR_STATUS } from '../lib/errors';

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });
}

/** 모든 오류를 { error: { code, message } } 형식으로 바꾼다 (F-53) */
export function errorResponse(err: unknown): Response {
  if (err instanceof AppError) return json({ error: { code: err.code, message: err.message } }, ERROR_STATUS[err.code]);
  if (err instanceof ZodError) {
    const msg = err.issues.map((i) => `${i.path.join('.') || '본문'}: ${i.message}`).join('; ');
    return json({ error: { code: 'INVALID_REQUEST', message: msg } }, 400);
  }
  console.error(err);
  return json({ error: { code: 'INTERNAL', message: '서버 오류가 났습니다. 잠시 뒤 다시 시도하세요.' } }, 500);
}

export function route(handler: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    try {
      return await handler(req);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new AppError('INVALID_REQUEST', '요청 본문이 올바른 JSON이 아닙니다.');
  }
}

/** /api/analyses/:id[/...] 에서 id를 꺼낸다 */
export function pathParam(req: Request, after = 'analyses'): string {
  const parts = new URL(req.url).pathname.split('/').filter(Boolean);
  const i = parts.indexOf(after);
  const id = i >= 0 ? parts[i + 1] : undefined;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) throw new AppError('NOT_FOUND', '분석을 찾을 수 없습니다.');
  return id;
}

export function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip') || 'local';
}

/** Neon·Blob 오류 시 2회 재시도 (8장 가용성) */
export async function withRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  let last: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof AppError) throw err;
      last = err;
      await new Promise((r) => setTimeout(r, 200 * (i + 1)));
    }
  }
  throw last;
}
