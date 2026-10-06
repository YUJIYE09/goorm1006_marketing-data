// 작업 막대: 업로드 영역, 타깃 선택, 문제 유형, 요약 복사 + 상태줄
import { useRef, useState, type DragEvent } from 'react';
import type { Result, Task } from '../../../lib/schema';
import { buildSummary } from '../../../lib/summary';
import { fetchSummary } from '../../api/client';
import styles from './Toolbar.module.css';

const TASKS: [Task, string][] = [
  ['regression', '회귀'],
  ['binary', '이진 분류'],
  ['multiclass', '다중 분류'],
  ['none', '타깃 없음'],
];

export interface ToolbarProps {
  result?: Result;
  /** 예시처럼 서버에 저장되지 않은 결과 */
  isExample?: boolean;
  onFile: (file: File) => void;
  onTarget?: (target: string | null) => void;
  onTask?: (task: Task) => void;
  busy?: boolean;
  status: { text: string; kind: 'info' | 'error' | 'ok'; percent?: number } | null;
}

export function Toolbar({ result, isExample, onFile, onTarget, onTask, busy, status }: ToolbarProps) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [copyFallback, setCopyFallback] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const canEdit = !!result && !isExample && result.meta.sourceAvailable && !busy;

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  };

  const copy = async () => {
    if (!result) return;
    let text: string;
    try {
      text = isExample ? buildSummary(result) : await fetchSummary(result.id);
    } catch {
      text = buildSummary(result);
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyFallback(text); // 복사가 막히면 선택 가능한 텍스트 상자로
    }
  };

  const targetOptions = result?.columns.filter((c) => c.type !== 'id' && c.type !== 'text' && c.type !== 'date' && !c.constant) ?? [];

  return (
    <div className={styles.wrap}>
      <div className={styles.bar}>
        <div
          className={`${styles.drop} ${drag ? styles.dragging : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
        >
          <button type="button" className={styles.primary} onClick={() => input.current?.click()} disabled={busy}>
            CSV 올리기
          </button>
          <span className={styles.dropHint}>또는 여기로 끌어다 놓기 · .csv .tsv .txt · 100MB 이하</span>
          <input
            ref={input}
            type="file"
            accept=".csv,.tsv,.txt,text/csv,text/plain"
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = '';
            }}
          />
        </div>
        {result && (
          <div className={styles.controls}>
            <label className={styles.field}>
              <span>타깃</span>
              <select aria-label="타깃 열" value={result.target ?? ''} disabled={!canEdit || !onTarget} onChange={(e) => onTarget?.(e.target.value || null)}>
                <option value="">타깃 없음</option>
                {targetOptions.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>문제 유형</span>
              <select aria-label="문제 유형" value={result.task} disabled={!canEdit || !onTask || !result.target} onChange={(e) => onTask?.(e.target.value as Task)}>
                {TASKS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className={styles.secondary} onClick={copy}>
              {copied ? '복사했습니다' : '요약 복사'}
            </button>
          </div>
        )}
      </div>
      <p className={styles.retention}>원본 CSV는 분석용으로 최대 24시간만 보관한 뒤 지웁니다. 분석 결과 주소를 아는 사람은 결과를 볼 수 있습니다.</p>
      <div className={styles.status} role="status" aria-live="polite">
        {status && (
          <span className={styles[status.kind]}>
            {status.text}
            {status.percent !== undefined && (
              <span className={styles.progress} aria-hidden="true">
                <span style={{ width: `${status.percent}%` }} />
              </span>
            )}
          </span>
        )}
      </div>
      {copyFallback && (
        <div className={styles.fallback}>
          <p>클립보드 접근이 막혀 있습니다. 아래 내용을 선택해 복사하세요.</p>
          <textarea readOnly value={copyFallback} rows={10} onFocus={(e) => e.currentTarget.select()} autoFocus />
          <button type="button" className={styles.secondary} onClick={() => setCopyFallback(null)}>
            닫기
          </button>
        </div>
      )}
    </div>
  );
}
