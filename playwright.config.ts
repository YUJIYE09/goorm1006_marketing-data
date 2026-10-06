import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    // 브라우저 설치 없이 시스템 Chromium을 쓰려면 PW_CHROMIUM_PATH 지정
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : undefined,
  },
  webServer: process.env.E2E_BASE_URL ? undefined : { command: 'npm run dev -- --port 5173 --strictPort', port: 5173, reuseExistingServer: true },
});
