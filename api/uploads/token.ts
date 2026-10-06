// Vercel Blob 클라이언트 업로드 토큰 발급. 크기·확장자를 이 단계에서 검사한다 (F-06, 8장 입력 보안)
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { AppError, MAX_UPLOAD_BYTES } from '../../lib/errors';
import { blobMode } from '../../server/blob';
import { checkUpload } from '../../server/upload';
import { clientIp, json, readJson, route } from '../../server/http';
import { rateLimit } from '../../server/rate-limit';

export const POST = route(async (req) => {
  if (blobMode() === 'local') throw new AppError('INVALID_REQUEST', '로컬 모드에서는 /api/uploads/local 을 씁니다.');
  const body = (await readJson(req)) as HandleUploadBody;
  if (body.type === 'blob.generate-client-token') rateLimit(`upload:${clientIp(req)}`, 20, 60 * 60 * 1000);
  const res = await handleUpload({
    body,
    request: req,
    onBeforeGenerateToken: async (pathname, clientPayload) => {
      const { size } = JSON.parse(clientPayload ?? '{}') as { size?: number };
      checkUpload(pathname, size ?? 0);
      return {
        maximumSizeInBytes: MAX_UPLOAD_BYTES,
        addRandomSuffix: true,
        allowedContentTypes: ['text/csv', 'text/plain', 'text/tab-separated-values', 'application/vnd.ms-excel', 'application/octet-stream'],
      };
    },
  });
  return json(res);
});
