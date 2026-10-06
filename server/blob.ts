// 원본 CSV 저장소. BLOB_READ_WRITE_TOKEN이 있으면 Vercel Blob, 없으면 로컬 폴더(.local-data/blobs)
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AppError } from '../lib/errors';

export const blobMode = (): 'vercel' | 'local' => (process.env.BLOB_READ_WRITE_TOKEN ? 'vercel' : 'local');
const LOCAL_DIR = join(process.cwd(), '.local-data', 'blobs');
const LOCAL_PREFIX = 'local://';

async function streamToBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function readBlob(url: string): Promise<Uint8Array> {
  if (url.startsWith(LOCAL_PREFIX)) {
    try {
      return new Uint8Array(await readFile(join(LOCAL_DIR, url.slice(LOCAL_PREFIX.length).replace(/[/\\]/g, ''))));
    } catch {
      throw new AppError('SOURCE_EXPIRED', '원본 파일이 없습니다. 다시 올려 주세요.');
    }
  }
  const { get } = await import('@vercel/blob');
  const res = await get(url, { access: 'private' });
  if (!res?.stream) throw new AppError('SOURCE_EXPIRED', '원본 파일이 삭제됐습니다. 다시 올려 주세요.');
  return streamToBytes(res.stream);
}

export async function deleteBlob(url: string): Promise<void> {
  if (url.startsWith(LOCAL_PREFIX)) {
    await rm(join(LOCAL_DIR, url.slice(LOCAL_PREFIX.length).replace(/[/\\]/g, '')), { force: true });
    return;
  }
  const { del } = await import('@vercel/blob');
  await del(url);
}

/** 로컬 개발 모드 전용 저장 */
export async function writeLocalBlob(fileName: string, bytes: Uint8Array): Promise<string> {
  await mkdir(LOCAL_DIR, { recursive: true });
  const safe = fileName.replace(/[^\w.\-가-힣]/g, '_').slice(-80);
  const name = `${randomUUID()}-${safe}`;
  await writeFile(join(LOCAL_DIR, name), bytes);
  return LOCAL_PREFIX + name;
}
