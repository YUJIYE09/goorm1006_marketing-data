import { useEffect, useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { NewAnalysis } from './pages/NewAnalysis';
import { ReportPage } from './pages/Report';
import { History } from './pages/History';
import styles from './App.module.css';

type ThemePref = 'system' | 'light' | 'dark';
const THEME_LABEL: Record<ThemePref, string> = { system: '테마: 시스템', light: '테마: 라이트', dark: '테마: 다크' };

function useThemePref(): [ThemePref, () => void] {
  const [pref, setPref] = useState<ThemePref>(() => {
    try {
      return (localStorage.getItem('theme') as ThemePref) || 'system';
    } catch {
      return 'system';
    }
  });
  useEffect(() => {
    if (pref === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', pref);
    try {
      localStorage.setItem('theme', pref);
    } catch {
      // 저장이 막혀도 이번 화면에는 적용된다
    }
  }, [pref]);
  const next = () => setPref((p) => (p === 'system' ? 'light' : p === 'light' ? 'dark' : 'system'));
  return [pref, next];
}

export function App() {
  const [pref, nextTheme] = useThemePref();
  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <NavLink to="/" className={styles.brand}>
            CSV 자동 EDA
          </NavLink>
          <nav className={styles.nav} aria-label="주 메뉴">
            <NavLink to="/" end className={({ isActive }) => (isActive ? styles.active : undefined)}>
              새 분석
            </NavLink>
            <NavLink to="/history" className={({ isActive }) => (isActive ? styles.active : undefined)}>
              최근 분석
            </NavLink>
          </nav>
          <button type="button" className={styles.themeBtn} onClick={nextTheme}>
            {THEME_LABEL[pref]}
          </button>
        </div>
      </header>
      <main className={styles.main}>
        <Routes>
          <Route path="/" element={<NewAnalysis />} />
          <Route path="/analyses/:id" element={<ReportPage />} />
          <Route path="/history" element={<History />} />
          <Route path="*" element={<p>없는 페이지입니다.</p>} />
        </Routes>
      </main>
    </div>
  );
}
