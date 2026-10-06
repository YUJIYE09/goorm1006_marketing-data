// Vite 개발 서버에서 /api/* 를 api/ 폴더의 Vercel Function 핸들러로 연결한다.
// 같은 핸들러(Web Request → Response)를 그대로 불러 쓰므로 배포 환경과 동작이 같다.
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin, ViteDevServer } from 'vite';

const ROUTES: [RegExp, string][] = [
  [/^\/api\/health$/, '/api/health.ts'],
  [/^\/api\/uploads\/token$/, '/api/uploads/token.ts'],
  [/^\/api\/uploads\/local$/, '/server/local-upload.ts'],
  [/^\/api\/analyses$/, '/api/analyses/index.ts'],
  [/^\/api\/analyses\/[^/]+\/summary$/, '/api/analyses/[id]/summary.ts'],
  [/^\/api\/analyses\/[^/]+$/, '/api/analyses/[id].ts'],
  [/^\/api\/cron\/cleanup-blobs$/, '/api/cron/cleanup-blobs.ts'],
];

async function toRequest(req: IncomingMessage): Promise<Request> {
  const chunks: Buffer[] = [];
  if (req.method !== 'GET' && req.method !== 'HEAD') for await (const c of req) chunks.push(c as Buffer);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
  return new Request(`http://${req.headers.host ?? 'localhost'}${req.url}`, {
    method: req.method,
    headers,
    body: chunks.length ? Buffer.concat(chunks) : undefined,
  });
}

async function send(res: ServerResponse, out: Response) {
  res.statusCode = out.status;
  out.headers.forEach((v, k) => res.setHeader(k, v));
  res.end(Buffer.from(await out.arrayBuffer()));
}

export function apiDevPlugin(): Plugin {
  return {
    name: 'eda-api-dev',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        const path = (req.url ?? '').split('?')[0];
        if (!path.startsWith('/api/')) return next();
        const hit = ROUTES.find(([re]) => re.test(path));
        if (!hit) {
          res.statusCode = 404;
          res.setHeader('content-type', 'application/json');
          return res.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: '없는 API 경로입니다.' } }));
        }
        try {
          const mod = (await server.ssrLoadModule(hit[1])) as Record<string, (r: Request) => Promise<Response>>;
          const handler = mod[req.method ?? 'GET'];
          if (!handler) {
            res.statusCode = 405;
            return res.end();
          }
          await send(res, await handler(await toRequest(req)));
        } catch (err) {
          server.ssrFixStacktrace(err as Error);
          console.error(err);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: { code: 'INTERNAL', message: String(err) } }));
        }
      });
    },
  };
}
