import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAnalyses, useDeleteAnalysis } from '../api/client';
import styles from './pages.module.css';

const TASK = { regression: '회귀', binary: '이진 분류', multiclass: '다중 분류', none: '타깃 없음' } as const;

export function History() {
  const [page, setPage] = useState(1);
  const list = useAnalyses(page);
  const del = useDeleteAnalysis();

  const remove = (id: string, name: string) => {
    if (window.confirm(`'${name}' 분석과 원본 파일을 삭제할까요? 되돌릴 수 없습니다.`)) del.mutate(id);
  };

  return (
    <>
      <h1 className={styles.fileTitle}>최근 분석</h1>
      <div role="status" aria-live="polite" className={styles.meta}>
        {del.isError ? del.error.message : del.isSuccess ? '삭제했습니다.' : ''}
      </div>
      {list.isPending && <p>불러오는 중입니다…</p>}
      {list.isError && <p>{list.error.message}</p>}
      {list.data && list.data.items.length === 0 && (
        <p>
          아직 분석이 없습니다. <Link to="/">CSV를 올려 보세요.</Link>
        </p>
      )}
      {list.data && list.data.items.length > 0 && (
        <div className={styles.tableCard}>
          <table>
            <thead>
              <tr>
                <th>파일</th>
                <th className="num">규모</th>
                <th>문제 유형</th>
                <th className="num">경고</th>
                <th>작성 시각</th>
                <th>원본</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.data.items.map((a) => (
                <tr key={a.id}>
                  <td>
                    <Link to={`/analyses/${a.id}`}>{a.fileName}</Link>
                  </td>
                  <td className="num">
                    {a.rows?.toLocaleString('ko-KR')} × {a.cols}
                  </td>
                  <td>
                    {TASK[a.task]}
                    {a.target ? ` (${a.target})` : ''}
                  </td>
                  <td className="num">{a.warnings}</td>
                  <td>{new Date(a.createdAt).toLocaleString('ko-KR')}</td>
                  <td>{a.sourceAvailable ? '보관 중' : '삭제됨'}</td>
                  <td>
                    <button type="button" className={styles.linkBtn} onClick={() => remove(a.id, a.fileName)} disabled={del.isPending}>
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className={styles.pager}>
        <button type="button" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
          이전
        </button>
        <span>{page}쪽</span>
        <button type="button" disabled={!list.data?.hasMore} onClick={() => setPage((p) => p + 1)}>
          다음
        </button>
      </div>
    </>
  );
}
