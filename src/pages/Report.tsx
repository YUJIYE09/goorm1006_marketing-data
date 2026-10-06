import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import type { ColType, Task } from '../../lib/schema';
import { useAnalysis, usePatchAnalysis } from '../api/client';
import { Report } from '../components/report/Report';
import { SectionNav } from '../components/report/SectionNav';
import { Toolbar, type ToolbarProps } from '../components/report/Toolbar';
import { useUpload } from '../hooks/useUpload';
import styles from './pages.module.css';

export function ReportPage() {
  const { id } = useParams();
  const location = useLocation();
  const flash = (location.state as { flash?: string } | null)?.flash;
  const query = useAnalysis(id);
  const patch = usePatchAnalysis(id ?? '');
  const upload = useUpload();
  const [patchNote, setPatchNote] = useState<string | null>(null);

  useEffect(() => setPatchNote(null), [id]);

  const r = query.data;
  const run = (opts: Parameters<typeof patch.mutate>[0], note: string) => {
    setPatchNote(null);
    patch.mutate(opts, { onSuccess: (res) => setPatchNote(`${note} 다시 분석했습니다 (서버 계산 ${res.meta.durationMs}ms).`) });
  };
  const onTarget = (target: string | null) => run({ target }, target ? `타깃을 '${target}'로 바꿔` : '타깃 없이');
  const onTask = (task: Task) => run({ target: r?.target ?? null, task }, '문제 유형을 바꿔');
  const onChangeType = (column: string, type: ColType) => {
    const current = Object.fromEntries(r!.columns.filter((c) => c.type !== c.inferredType).map((c) => [c.name, c.type]));
    run({ columnTypes: { ...current, [column]: type } }, `'${column}' 유형을 바꿔`);
  };

  let status: ToolbarProps['status'] = upload.status;
  if (!status) {
    if (patch.isPending) status = { kind: 'info', text: 'Blob 원본을 다시 읽어 분석 중입니다…' };
    else if (patch.isError) status = { kind: 'error', text: patch.error.message };
    else if (patchNote) status = { kind: 'ok', text: patchNote };
    else if (r && !r.meta.sourceAvailable) status = { kind: 'info', text: '원본 CSV가 보관 기간(24시간)이 지나 삭제돼 결과만 볼 수 있습니다. 타깃을 바꾸려면 파일을 다시 올려 주세요.' };
    else if (flash) status = { kind: 'ok', text: flash };
  }

  if (query.isPending) return <p className={styles.center}>결과를 불러오는 중입니다…</p>;
  if (query.isError)
    return (
      <div className={styles.center}>
        <p>{query.error.message}</p>
        <Link to="/">새 분석으로 가기</Link>
      </div>
    );

  return (
    <>
      <div className={styles.titleRow}>
        <h1 className={styles.fileTitle}>{r!.meta.fileName}</h1>
        <span className={styles.meta}>
          {new Date(r!.meta.generatedAt).toLocaleString('ko-KR')} · 구분자 {r!.meta.delimiter === '\t' ? 'TAB' : `'${r!.meta.delimiter}'`} · {r!.meta.encoding.toUpperCase()}
        </span>
      </div>
      <Toolbar result={r} onFile={upload.onFile} onTarget={onTarget} onTask={onTask} busy={upload.busy || patch.isPending} status={status} />
      <SectionNav r={r!} />
      <Report r={r!} onChangeType={r!.meta.sourceAvailable ? onChangeType : undefined} busy={patch.isPending} />
    </>
  );
}
