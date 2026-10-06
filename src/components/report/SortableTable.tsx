import { useState, type ReactNode } from 'react';
import styles from './Report.module.css';

export interface Column<T> {
  key: string;
  label: string;
  num?: boolean;
  value: (row: T) => number | string | null;
  render?: (row: T) => ReactNode;
}

/** 머리글을 눌러 정렬하는 표 */
export function SortableTable<T>({ rows, columns, caption, initialSort }: { rows: T[]; columns: Column<T>[]; caption: string; initialSort?: { key: string; desc: boolean } }) {
  const [sort, setSort] = useState(initialSort ?? null);
  const sorted = [...rows];
  if (sort) {
    const col = columns.find((c) => c.key === sort.key)!;
    sorted.sort((a, b) => {
      const x = col.value(a);
      const y = col.value(b);
      if (x === y) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      const d = x < y ? -1 : 1;
      return sort.desc ? -d : d;
    });
  }
  return (
    <div className={styles.tableWrap}>
      <table>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => {
              const active = sort?.key === c.key;
              return (
                <th key={c.key} className={c.num ? 'num' : undefined} aria-sort={active ? (sort!.desc ? 'descending' : 'ascending') : 'none'}>
                  <button className={styles.sortBtn} onClick={() => setSort({ key: c.key, desc: active ? !sort!.desc : !!c.num })}>
                    {c.label}
                    <span aria-hidden="true">{active ? (sort!.desc ? ' ▾' : ' ▴') : ''}</span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c.key} className={c.num ? 'num' : undefined}>
                  {c.render ? c.render(r) : String(c.value(r) ?? '–')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
