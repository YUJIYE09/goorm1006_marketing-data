import type { Result } from '../../../lib/schema';
import { SECTIONS } from './Report';
import styles from './Toolbar.module.css';

/** 섹션 바로가기 (앵커 이동) */
export function SectionNav({ r }: { r: Result }) {
  const hidden = new Set<string>(r.task === 'none' ? ['target', 'leakage'] : []);
  return (
    <nav aria-label="섹션 바로가기" className={styles.sectionNav}>
      {SECTIONS.filter(([id]) => !hidden.has(id)).map(([id, label]) => (
        <a key={id} href={`#${id}`}>
          {label}
        </a>
      ))}
    </nav>
  );
}
