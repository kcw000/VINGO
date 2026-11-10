import { test, expect, lockCard, mark, acceptReset, settings, saveSettings } from './helpers.js';

test.beforeEach(async ({ page }) => { await page.goto('./'); });

test('トップ画面・未抽選カード・主要操作の初期状態', async ({ page }) => {
  await expect(page).toHaveTitle('VOCALOID BINGO');
  await expect(page.locator('h1')).toContainText('Vocaloid');
  await expect(page.locator('#grid .cell.empty')).toHaveCount(9);
  await expect(page.locator('#btn-lock')).toBeDisabled();
  await expect(page.locator('#btn-random')).toBeEnabled();
  await expect(page.locator('#settings-btn')).toBeVisible();
});

test('重複のない候補50曲から9曲を抽選・引き直し・確定前はチェック不可', async ({ page }) => {
  const data = settings();
  await saveSettings(page, data);
  await page.locator('#settings-close').click();
  for (let i = 0; i < 10; i++) {
    await page.locator('#btn-random').click();
    const songs = await page.locator('#grid .cell span').allTextContents();
    expect(songs).toHaveLength(9);
    expect(new Set(songs).size).toBe(9);
    expect(songs.every(song => data.songs.includes(song))).toBe(true);
  }
  await page.locator('#grid .cell').first().click();
  await expect(page.locator('#grid .marked')).toHaveCount(0);
});

test('カード確定で抽選を無効化・マスのチェックと解除', async ({ page }) => {
  await lockCard(page);
  const before = await page.locator('#grid .cell span').allTextContents();
  await expect(page.locator('#btn-random')).toBeDisabled();
  await expect(page.locator('#btn-lock')).toBeDisabled();
  // Verify the underlying guard as well as the disabled UI; no production hook added.
  await page.evaluate(() => randomize());
  expect(await page.locator('#grid .cell span').allTextContents()).toEqual(before);
  await mark(page, [4]);
  await expect(page.locator('#grid .marked')).toHaveCount(1);
  await mark(page, [4]);
  await expect(page.locator('#grid .marked')).toHaveCount(0);
});

const lines = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
for (const [i, indexes] of lines.entries()) {
  test(`縦・横・斜めのVINGO成立と解除：ライン${i + 1}`, async ({ page }) => {
    await lockCard(page);
    await mark(page, indexes.slice(0, 2));
    await expect(page.locator('#vingo-banner')).not.toBeVisible();
    await mark(page, indexes.slice(2));
    await expect(page.locator('#vingo-banner')).toBeVisible();
    await expect(page.locator('#grid .bingo-line')).toHaveCount(3);
    await mark(page, indexes.slice(2));
    await expect(page.locator('#vingo-banner')).not.toBeVisible();
  });
}

test('512通りのVINGO判定を座標ベースの独立した判定と照合', async ({ page }) => {
  const actual = await page.evaluate(() => {
    const results = [];
    for (let mask = 0; mask < 512; mask++) {
      state.marks = Array.from({ length: 9 }, (_, i) => Boolean(mask & (1 << i)));
      checkBingo();
      results.push({ bingo: state.bingo, cells: [...getHighlightedCells()].sort() });
    }
    return results;
  });
  for (let mask = 0; mask < 512; mask++) {
    const has = (x, y) => Boolean(mask & (1 << (y * 3 + x)));
    const wins = [];
    for (let axis = 0; axis < 3; axis++) {
      if ([0, 1, 2].every(x => has(x, axis))) wins.push(...[0, 1, 2].map(x => axis * 3 + x));
      if ([0, 1, 2].every(y => has(axis, y))) wins.push(...[0, 1, 2].map(y => y * 3 + axis));
    }
    if ([0, 1, 2].every(n => has(n, n))) wins.push(0, 4, 8);
    if ([0, 1, 2].every(n => has(2 - n, n))) wins.push(2, 4, 6);
    expect(actual[mask], `mask=${mask}`).toEqual({ bingo: wins.length > 0, cells: [...new Set(wins)].sort() });
  }
});

test('複数ラインのうち1本を解除しても残るラインは成立する', async ({ page }) => {
  await lockCard(page);
  await mark(page, [0, 1, 2, 3, 6]);
  await expect(page.locator('#grid .bingo-line')).toHaveCount(5);
  await mark(page, [1]);
  await expect(page.locator('#vingo-banner')).toBeVisible();
  await expect(page.locator('#grid .bingo-line')).toHaveCount(3);
});

test('盤面リセットの取消・実行と再抽選', async ({ page }) => {
  await lockCard(page);
  await mark(page, [0, 1, 2]);
  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('#btn-reset').click();
  await expect(page.locator('#vingo-banner')).toBeVisible();
  await acceptReset(page, '#btn-reset');
  await expect(page.locator('#grid .cell.empty')).toHaveCount(9);
  await expect(page.locator('#vingo-banner')).not.toBeVisible();
  await expect(page.locator('#sns-section')).not.toBeVisible();
  await expect(page.locator('#vingo-timestamp')).not.toBeVisible();
  await expect(page.locator('#btn-random')).toBeEnabled();
  await expect(page.locator('#btn-lock')).toBeDisabled();
  await lockCard(page);
});
