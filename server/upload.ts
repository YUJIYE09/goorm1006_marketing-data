import { ALLOWED_EXTENSIONS, AppError, MAX_UPLOAD_BYTES } from '../lib/errors';

export function checkUpload(fileName: string, size: number) {
  const dot = fileName.lastIndexOf('.');
  const ext = dot >= 0 ? fileName.slice(dot).toLowerCase() : '';
  if (!ALLOWED_EXTENSIONS.includes(ext)) throw new AppError('UNSUPPORTED_FORMAT', '.csv, .tsv, .txt 파일만 올릴 수 있습니다.');
  if (size > MAX_UPLOAD_BYTES) throw new AppError('FILE_TOO_LARGE', '100MB를 넘는 파일은 올릴 수 없습니다.');
}
