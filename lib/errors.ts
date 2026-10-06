export type ErrorCode =
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_FORMAT'
  | 'PARSE_FAILED'
  | 'INVALID_TARGET'
  | 'INVALID_REQUEST'
  | 'SOURCE_EXPIRED'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'INTERNAL';

export const ERROR_STATUS: Record<ErrorCode, number> = {
  FILE_TOO_LARGE: 413,
  UNSUPPORTED_FORMAT: 415,
  PARSE_FAILED: 422,
  INVALID_TARGET: 422,
  INVALID_REQUEST: 400,
  SOURCE_EXPIRED: 410,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
export const ALLOWED_EXTENSIONS = ['.csv', '.tsv', '.txt'];
