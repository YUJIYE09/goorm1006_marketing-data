// 로컬 개발 모드 전용: Vercel Blob 대신 .local-data/blobs 에 저장한다. 배포되지 않는다 (api/ 밖에 있음).
import { AppError } from '../lib/errors';
import { writeLocalBlob } from './blob';
import { json, route } from './http';
import { checkUpload } from './upload';

export const PUT = route(async (req) => {
  const name = new URL(req.url).searchParams.get('name') ?? '';
  const size = Number(req.headers.get('content-length') ?? 0);
  checkUpload(name, size);
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (!bytes.byteLength) throw new AppError('PARSE_FAILED', '파일이 비어 있습니다.');
  checkUpload(name, bytes.byteLength);
  return json({ url: await writeLocalBlob(name, bytes) });
});
