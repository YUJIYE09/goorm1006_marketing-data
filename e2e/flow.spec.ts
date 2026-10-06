// E2E: 업로드 → 리포트 → 타깃 변경 → 이력 → 삭제 (npm run dev 로컬 모드 또는 미리보기 배포에서)
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

// 같은 파일은 SHA-256으로 기존 결과를 열기 때문에(F-44) 공백 줄을 붙여 매번 다른 파일로 만든다
const uniqueBankFull = () => ({
  name: 'bank-full.csv',
  mimeType: 'text/csv',
  buffer: Buffer.concat([readFileSync('tests/fixtures/bank-full.csv'), Buffer.from(' '.repeat(1 + (Date.now() % 100000)) + '\n')]),
});

test('예시 리포트가 첫 화면에 보인다', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('아래는 예시입니다')).toBeVisible();
  await expect(page.locator('#target h2')).toContainText("양성('yes') 비율");
});

test('bank-full.csv 업로드부터 삭제까지', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(uniqueBankFull());
  await page.waitForURL(/\/analyses\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  await expect(page.locator('#overview h2')).toContainText('45,211행 × 17열');
  await expect(page.locator('#target h2')).toContainText('11.7%');
  await expect(page.getByRole('alert')).toContainText('duration');

  await page.getByLabel('타깃 열', { exact: true }).selectOption('balance');
  await expect(page.locator('#target h2')).toContainText("'balance'은 평균", { timeout: 30_000 });

  await page.getByRole('link', { name: '최근 분석' }).click();
  await expect(page.getByRole('link', { name: 'bank-full.csv' }).first()).toBeVisible();
  page.once('dialog', (d) => d.accept());
  const before = await page.getByRole('row').count();
  await page.getByRole('button', { name: '삭제' }).first().click();
  await expect(page.getByRole('row')).toHaveCount(before - 1);
});

test('400px 폭에서 가로 스크롤이 없다', async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 900 });
  await page.goto('/');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
