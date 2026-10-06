import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateAnalysis, type UploadProgress } from '../api/client';
import type { ToolbarProps } from '../components/report/Toolbar';

/** 업로드 → 분석 → 리포트 이동. 상태줄 문구를 함께 돌려준다 */
export function useUpload() {
  const navigate = useNavigate();
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const create = useCreateAnalysis(setProgress);

  const onFile = (file: File) => {
    setStartedAt(performance.now());
    create.mutate(file, {
      onSuccess: ({ result, duplicate }) => {
        const secs = ((performance.now() - startedAt) / 1000).toFixed(1);
        navigate(`/analyses/${result.id}`, { state: { flash: duplicate ? '같은 파일을 이전에 분석한 결과가 있어 그 결과를 열었습니다.' : `분석을 마쳤습니다 (${secs}초, 서버 계산 ${result.meta.durationMs}ms).` } });
      },
    });
  };

  let status: ToolbarProps['status'] = null;
  if (create.isError) status = { kind: 'error', text: create.error.message };
  else if (create.isPending && progress?.stage === 'upload') status = { kind: 'info', text: `업로드 중 ${Math.round(progress.percent)}%`, percent: progress.percent };
  else if (create.isPending) status = { kind: 'info', text: '서버에서 분석 중입니다: 파싱 → 프로파일 → 분석 → 저장' };
  return { onFile, status, busy: create.isPending };
}
