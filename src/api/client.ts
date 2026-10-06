// fetch 래퍼 + TanStack Query 훅. 응답은 lib/schema.ts의 Zod 스키마로 검증한다.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnalysisListSchema, ResultSchema, type AnalysisList, type AnalysisOptions, type Result } from '../../lib/schema';

const MESSAGES: Record<string, string> = {
  FILE_TOO_LARGE: '파일이 100MB를 넘습니다. 행을 줄이거나 나눠서 올려 주세요.',
  UNSUPPORTED_FORMAT: '.csv, .tsv, .txt 파일만 분석할 수 있습니다.',
  SOURCE_EXPIRED: '원본 CSV가 24시간 보관 기간이 지나 삭제됐습니다. 다시 분석하려면 파일을 새로 올려 주세요.',
  NOT_FOUND: '분석을 찾을 수 없습니다. 삭제됐거나 주소가 잘못됐습니다.',
  RATE_LIMITED: '요청이 너무 많습니다. 1분 뒤 다시 시도하세요.',
  INTERNAL: '서버 오류가 났습니다. 잠시 뒤 다시 시도하세요.',
};

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** 서버 오류 코드를 한국어 안내로 바꾼다 (F-53). PARSE_FAILED·INVALID_TARGET은 서버 문장이 더 구체적이라 그대로 쓴다 */
async function toError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as { error?: { code: string; message: string } };
    const code = body.error?.code ?? 'INTERNAL';
    return new ApiError(code, MESSAGES[code] && code !== 'NOT_FOUND' ? MESSAGES[code] : body.error?.message ?? MESSAGES.INTERNAL, res.status);
  } catch {
    return new ApiError('INTERNAL', MESSAGES.INTERNAL, res.status);
  }
}

async function request<T>(path: string, init: RequestInit = {}, parse?: (data: unknown) => T): Promise<{ data: T; res: Response }> {
  const res = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...init.headers } });
  if (!res.ok) throw await toError(res);
  if (res.status === 204) return { data: undefined as T, res };
  const data = (await res.json()) as unknown;
  return { data: parse ? parse(data) : (data as T), res };
}

const parseResult = (d: unknown) => ResultSchema.parse(d) as Result;

// ---- 업로드 ----

export type UploadStage = 'upload' | 'analyze' | 'done';
export interface UploadProgress {
  stage: UploadStage;
  percent: number;
}

interface Health {
  ok: boolean;
  storage: { db: 'neon' | 'local'; blob: 'vercel' | 'local' };
}

export function useHealth() {
  return useQuery({ queryKey: ['health'], queryFn: async () => (await request<Health>('/api/health')).data, staleTime: Infinity });
}

function uploadLocal(file: File, onProgress: (p: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', `/api/uploads/local?name=${encodeURIComponent(file.name)}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress((e.loaded / e.total) * 100);
    xhr.onload = async () => {
      const res = new Response(xhr.responseText, { status: xhr.status });
      if (xhr.status >= 400) reject(await toError(res));
      else resolve((JSON.parse(xhr.responseText) as { url: string }).url);
    };
    xhr.onerror = () => reject(new ApiError('INTERNAL', '업로드 중 연결이 끊겼습니다. 다시 시도하세요.', 0));
    xhr.send(file);
  });
}

async function uploadVercel(file: File, onProgress: (p: number) => void): Promise<string> {
  const { upload } = await import('@vercel/blob/client');
  try {
    const blob = await upload(file.name, file, {
      access: 'private',
      handleUploadUrl: '/api/uploads/token',
      clientPayload: JSON.stringify({ size: file.size }),
      multipart: file.size > 20 * 1024 * 1024,
      onUploadProgress: (e) => onProgress(e.percentage),
    });
    return blob.url;
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (/100MB|too large/i.test(msg)) throw new ApiError('FILE_TOO_LARGE', MESSAGES.FILE_TOO_LARGE, 413);
    if (/\.csv|content type/i.test(msg)) throw new ApiError('UNSUPPORTED_FORMAT', MESSAGES.UNSUPPORTED_FORMAT, 415);
    throw new ApiError('INTERNAL', `업로드에 실패했습니다. ${msg}`, 0);
  }
}

const ALLOWED = /\.(csv|tsv|txt)$/i;

export function useCreateAnalysis(onProgress: (p: UploadProgress) => void) {
  const qc = useQueryClient();
  const health = useHealth();
  return useMutation({
    mutationFn: async (file: File): Promise<{ result: Result; duplicate: boolean }> => {
      if (!ALLOWED.test(file.name)) throw new ApiError('UNSUPPORTED_FORMAT', MESSAGES.UNSUPPORTED_FORMAT, 415);
      if (file.size > 100 * 1024 * 1024) throw new ApiError('FILE_TOO_LARGE', MESSAGES.FILE_TOO_LARGE, 413);
      const mode = health.data?.storage.blob ?? 'local';
      onProgress({ stage: 'upload', percent: 0 });
      const report = (p: number) => onProgress({ stage: 'upload', percent: p });
      const blobUrl = mode === 'vercel' ? await uploadVercel(file, report) : await uploadLocal(file, report);
      onProgress({ stage: 'analyze', percent: 100 });
      const { data, res } = await request('/api/analyses', {
        method: 'POST',
        body: JSON.stringify({ blobUrl, fileName: file.name, sizeBytes: file.size }),
      }, parseResult);
      onProgress({ stage: 'done', percent: 100 });
      return { result: data, duplicate: res.headers.has('x-duplicate-of') };
    },
    onSuccess: ({ result }) => {
      qc.setQueryData(['analysis', result.id], result);
      void qc.invalidateQueries({ queryKey: ['analyses'] });
    },
  });
}

// ---- 조회·수정·삭제 ----

export function useAnalysis(id: string | undefined) {
  return useQuery({
    queryKey: ['analysis', id],
    enabled: !!id,
    queryFn: async () => (await request(`/api/analyses/${id}`, {}, parseResult)).data,
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 1,
  });
}

export function useAnalyses(page: number) {
  return useQuery({
    queryKey: ['analyses', page],
    queryFn: async () => (await request(`/api/analyses?page=${page}&limit=20`, {}, (d) => AnalysisListSchema.parse(d) as AnalysisList)).data,
  });
}

export function usePatchAnalysis(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (opts: AnalysisOptions) =>
      (await request(`/api/analyses/${id}`, { method: 'PATCH', body: JSON.stringify(opts) }, parseResult)).data,
    onSuccess: (result) => {
      qc.setQueryData(['analysis', id], result);
      void qc.invalidateQueries({ queryKey: ['analyses'] });
    },
  });
}

export function useDeleteAnalysis() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await request(`/api/analyses/${id}`, { method: 'DELETE' });
      return id;
    },
    onSuccess: (id) => {
      qc.removeQueries({ queryKey: ['analysis', id] });
      void qc.invalidateQueries({ queryKey: ['analyses'] });
    },
  });
}

export async function fetchSummary(id: string): Promise<string> {
  const res = await fetch(`/api/analyses/${id}/summary`);
  if (!res.ok) throw await toError(res);
  return res.text();
}
