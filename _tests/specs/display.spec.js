import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { test, expect, lockCard, mark, openSettings, saveSettings, settings } from './helpers.js';
import { artifacts } from '../paths.mjs';

const themes = ['simple', 'miku', 'rin', 'ren', 'luka', 'meiko', 'kaito'];
async function checkLayout(page) {
  const geometry = await page.evaluate(() => {
    const boxes = [...document.querySelectorAll('#grid .cell')].map(cell => {
      const { x, y, width, height } = cell.getBoundingClientRect();
      return { x, y, width, height };
    });
    return { width: innerWidth, pageWidth: document.documentElement.scrollWidth, boxes };
  });
  expect(geometry.pageWidth).toBeLessThanOrEqual(geometry.width + 1);
  expect(geometry.boxes).toHaveLength(9);
  for (const [i, box] of geometry.boxes.entries()) {
    expect(box.width).toBeGreaterThan(30);
    expect(box.height).toBeGreaterThan(30);
    expect(box.x).toBeGreaterThanOrEqual(-1);
    expect(box.x + box.width).toBeLessThanOrEqual(geometry.width + 1);
    if (i % 3 !== 2) expect(box.x + box.width).toBeLessThanOrEqual(geometry.boxes[i + 1].x + 1);
    if (i < 6) expect(box.y + box.height).toBeLessThanOrEqual(geometry.boxes[i + 3].y + 1);
  }
}

for (const width of [320, 390, 768, 1440]) {
  for (const theme of themes) {
    test(`theme-${theme}・${width}px：切替・保存・3×3配置・設定操作`, async ({ page }) => {
      await page.setViewportSize({ width, height: 960 });
      await page.goto('./');
      const button = page.locator(`[data-theme="theme-${theme}"]`);
      await button.click();
      await expect(button).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('[data-theme][aria-pressed="true"]')).toHaveCount(1);
      await expect(page.locator('body')).toHaveClass(new RegExp(`theme-${theme}`));
      await page.reload();
      await expect(page.locator('body')).toHaveClass(new RegExp(`theme-${theme}`));
      await expect(button).toHaveAttribute('aria-pressed', 'true');
      await checkLayout(page);
      await lockCard(page);
      await checkLayout(page);
      await mark(page, [0, 1, 2]);
      await checkLayout(page);
      await expect(page.locator('#vingo-banner')).toBeVisible();
      await openSettings(page);
      await expect(page.locator('#vingo-banner')).not.toBeVisible();
      await page.locator('#settings-event-name').fill('モーダル操作確認');
      await expect(page.locator('#settings-event-name')).toHaveValue('モーダル操作確認');
      const modal = await page.locator('.settings-modal').boundingBox();
      expect(modal.x).toBeGreaterThanOrEqual(0);
      expect(modal.x + modal.width).toBeLessThanOrEqual(width + 1);
      await page.locator('#settings-share-link').click();
      await expect(page.locator('#share-url-text')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
      await page.locator('#settings-close').click();
      await expect(page.locator('#vingo-banner')).toBeVisible();
      await expect(page.locator('#celebration-overlay')).not.toBeVisible();
      // Evidence only, not a golden snapshot accepting known unreadable colors.
      await mkdir(path.join(artifacts, 'visual'), { recursive: true });
      await page.screenshot({ path: path.join(artifacts, 'visual', `${theme}-${width}.png`), fullPage: true });
    });
  }
}

test.describe('演出時計の制御', () => {
  test.use({ clockMode: 'manual' });
  test('達成日時・SNS案内・演出中のモーダル操作とマス操作', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-11-09T03:34:00Z') });
    await page.clock.pauseAt(new Date('2026-11-09T03:34:00Z'));
    await page.goto('./');
    await saveSettings(page, settings(9));
    await page.locator('#settings-close').click();
    await lockCard(page);
    await mark(page, [0, 1, 2]);
    await expect(page.locator('#vingo-banner')).toBeVisible();
    await expect(page.locator('#vingo-timestamp')).toHaveText('VINGO達成：2026/11/09 12:34');
    await expect(page.locator('#sns-step2')).toContainText('テスト運営');
    // The animation starts after a short delay; advance the test clock, not wall time.
    await page.clock.runFor(250);
    await expect(page.locator('#confetti-canvas')).toHaveClass(/active/);
    await expect(page.locator('#confetti-canvas')).toHaveCSS('pointer-events', 'none');
    await expect(page.locator('#celebration-overlay')).toHaveCSS('pointer-events', 'none');
    await openSettings(page);
    for (const id of ['vingo-banner', 'sns-section', 'confetti-canvas', 'celebration-overlay']) {
      await expect(page.locator(`#${id}`)).not.toBeVisible();
    }
    await page.locator('#settings-organizer-name').fill('入力操作できる');
    await expect(page.locator('#settings-organizer-name')).toHaveValue('入力操作できる');
    await page.locator('#settings-close').click();
    await mark(page, [4]);
    await expect(page.locator('#grid .cell').nth(4)).toHaveClass(/marked/);
    await page.clock.runFor(1600);
    await expect(page.locator('#confetti-canvas')).not.toHaveClass(/active/);
    await expect(page.locator('#vingo-banner')).toBeVisible();
    await page.locator('#btn-replay').click();
    await page.clock.runFor(250);
    await expect(page.locator('#confetti-canvas')).toHaveClass(/active/);
    await expect(page.locator('#vingo-timestamp')).toHaveText('VINGO達成：2026/11/09 12:34');
  });
});
