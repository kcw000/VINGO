import { test as base, expect } from '@playwright/test';
import { origin } from '../paths.mjs';

export { expect };
export const fixedTime = new Date('2026-11-09T03:34:00Z');

// Only the final acceptance assertion is an expected failure. Setup remains strict.
export function expectKnownIssue(actual, id, description) {
  test.fail(true, `${id}: 未解決の受入条件`);
  return expect(actual, `[${id} acceptance] ${description}`);
}

export async function prepareContext(context) {
  await context.addInitScript(() => {
    let seed = 20261109;
    Math.random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  });
  const errors = [], consoleErrors = [], external = [];
  context.on('page', page => {
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  });
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    external.push(route.request().url());
    return route.abort();
  });
  return { errors, consoleErrors, external };
}

export const test = base.extend({
  clockMode: ['fixed', { option: true }],
  page: async ({ page, clockMode }, use) => {
    // Freeze only Date; animation and reload timers still run normally.
    if (clockMode === 'fixed') await page.clock.setFixedTime(fixedTime);
    await use(page);
  },
  allowMalformedSettingsError: [false, { option: true }],
  audit: [async ({ context, allowMalformedSettingsError }, use) => {
    const { errors, consoleErrors, external } = await prepareContext(context);
    await use({ errors });
    expect(external, 'テスト中に外部サイトへ接続しない').toEqual([]);
    expect(consoleErrors, 'ブラウザconsole.errorなし').toEqual([]);
    const unexpected = allowMalformedSettingsError ? errors.filter(e => !/name\.trim is not a function/.test(e)) : errors;
    expect(unexpected, '想定外のJavaScript例外なし').toEqual([]);
  }, { auto: true }],
});

export function settings(count = 50, overrides = {}) {
  return { v: 1, eventName: '架空の音楽祭', organizerName: 'テスト運営', xTarget: '@vingo_test_example', igTarget: 'vingo_test_example',
    songs: Array.from({ length: count }, (_, i) => `検証用楽曲${String(i + 1).padStart(3, '0')}・春の音♪`), ...overrides };
}
export async function openSettings(page) {
  await page.locator('#settings-btn').click();
  await expect(page.locator('#settings-modal')).toBeVisible();
  await expect(page.locator('#settings-title')).toContainText('イベント設定');
}
export async function fillSettings(page, data) {
  await page.locator('#settings-event-name').fill(data.eventName);
  await page.locator('#settings-organizer-name').fill(data.organizerName);
  await page.locator('#settings-x-target').fill(data.xTarget);
  await page.locator('#settings-ig-target').fill(data.igTarget);
  await page.locator('#settings-songs').fill(data.songs.join('\n'));
}
export async function stored(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('vingo_settings_json')));
}
export async function saveSettings(page, data) {
  await openSettings(page);
  await fillSettings(page, data);
  await page.locator('#settings-save').click();
  await expect(page.locator('#toast')).toContainText('設定を保存しました');
  expect(await stored(page)).toEqual(data);
}
export async function shareUrl(page) {
  await page.locator('#settings-share-link').click();
  const url = await page.locator('#share-url-text').innerText();
  expect(new URL(url).origin).toBe(origin);
  expect(new URL(url).pathname).toBe('/VINGO/');
  return url;
}
export async function lockCard(page) {
  await page.locator('#btn-random').click();
  await expect(page.locator('#grid .cell span')).toHaveCount(9);
  await page.locator('#btn-lock').click();
  await expect(page.locator('#status-text')).toHaveText('確定済み');
}
export async function mark(page, indexes) {
  for (const i of indexes) await page.locator('#grid .cell').nth(i).click();
}
export function decodeLink(url) {
  return JSON.parse(Buffer.from(new URL(url).searchParams.get('cfg'), 'base64url').toString('utf8'));
}
export async function acceptReset(page, selector) {
  page.once('dialog', dialog => dialog.accept());
  await page.locator(selector).click();
}
// Resolve on the actual subsequent reload, not the 1.5-second implementation delay.
export async function waitForImportedReload(page, action) {
  const navigation = page.waitForEvent('framenavigated', frame => frame === page.mainFrame() && frame.url().endsWith('/VINGO/'));
  await action();
  await navigation;
  await page.waitForLoadState('load');
}
