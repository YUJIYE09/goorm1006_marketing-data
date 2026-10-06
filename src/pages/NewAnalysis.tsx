import exampleJson from '../example/bank-sample.json';
import { ResultSchema, type Result } from '../../lib/schema';
import { Report } from '../components/report/Report';
import { SectionNav } from '../components/report/SectionNav';
import { Toolbar } from '../components/report/Toolbar';
import { useUpload } from '../hooks/useUpload';
import styles from './pages.module.css';

const example = ResultSchema.parse(exampleJson) as Result;

export function NewAnalysis() {
  const { onFile, status, busy } = useUpload();
  return (
    <>
      <div className={styles.intro}>
        <h1>CSV 하나로 30초 안에 데이터 파악하기</h1>
        <p>파일을 올리면 열 유형 판별, 분포, 타깃과의 연관, 데이터 품질 경고, 권장 전처리 목록을 자동으로 만듭니다.</p>
      </div>
      <Toolbar result={example} isExample onFile={onFile} busy={busy} status={status} />
      <div className={styles.exampleNote}>
        아래는 예시입니다: UCI Bank Marketing 표본 4,521행을 미리 분석한 결과 (Moro et al., 2011, CC BY 4.0).{' '}
        <a href="/samples/bank.csv" download>
          예시 CSV 내려받기
        </a>
      </div>
      <SectionNav r={example} />
      <Report r={example} />
    </>
  );
}
