import { test, expect, settings, saveSettings, openSettings, stored, lockCard, mark } from './helpers.js';

for (const count of [9, 50, 300]) {
  test(`${count}曲・イベント名・主催者・SNS宛先の保存と再読み込み`, async ({ page }) => {
    await page.goto('./');
    const data = settings(count);
    await saveSettings(page, data);
    await expect(page.locator('#song-count')).toHaveText(`曲数：${count}`);
    await page.locator('#settings-close').click();
    await expect(page.locator('#event-name-text')).toHaveText(data.eventName);
    await page.reload();
    expect(await stored(page)).toEqual(data);
    await openSettings(page);
    for (const [id, value] of Object.entries({ 'settings-event-name': data.eventName, 'settings-organizer-name': data.organizerName, 'settings-x-target': data.xTarget, 'settings-ig-target': data.igTarget, 'settings-songs': data.songs.join('\n') })) {
      await expect(page.locator(`#${id}`)).toHaveValue(value);
    }
    await page.locator('#settings-close').click();
    await lockCard(page);
    const drawn = await page.locator('#grid .cell span').allTextContents();
    expect(new Set(drawn).size).toBe(9);
    expect(drawn.every(song => data.songs.includes(song))).toBe(true);
    await mark(page, [0, 1, 2]);
    await expect(page.locator('#sns-step2')).toContainText(data.organizerName);
    await expect(page.locator('.sns-btn.twitter')).toHaveAttribute('href', 'https://x.com/vingo_test_example');
    await expect(page.locator('.sns-btn:not(.twitter)')).toHaveAttribute('href', 'https://www.instagram.com/vingo_test_example/');
    await expect(page.locator('.sns-btn.twitter')).toHaveAttribute('target', '_blank');
  });
}

test('SNS未設定時に送付ボタンを表示しない', async ({ page }) => {
  await page.goto('./');
  await saveSettings(page, settings(9, { xTarget: '', igTarget: '', organizerName: '' }));
  await page.locator('#settings-close').click();
  await lockCard(page);
  await mark(page, [0, 1, 2]);
  await expect(page.locator('#sns-section')).toBeVisible();
  await expect(page.locator('.sns-btn.twitter')).not.toBeVisible();
  await expect(page.locator('.sns-btn:not(.twitter)')).not.toBeVisible();
});

test('全設定リセットは曲・イベント・主催者・SNSを戻しテーマを保つ', async ({ page }) => {
  await page.goto('./');
  await page.locator('[data-theme="theme-miku"]').click();
  await saveSettings(page, settings(9));
  page.once('dialog', dialog => dialog.accept());
  await Promise.all([page.waitForEvent('load'), page.locator('#settings-reset').click()]);
  expect(await stored(page)).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('vingo_event_name'))).toBeNull();
  await expect(page.locator('#event-name-text')).toHaveText('VINGO EVENT');
  await expect(page.locator('body')).toHaveClass(/theme-miku/);
  await expect(page.locator('#grid .cell.empty')).toHaveCount(9);
  await openSettings(page);
  await expect(page.locator('#settings-organizer-name')).toHaveValue('');
  await expect(page.locator('#song-count')).toHaveText('曲数：276');
  await expect(page.locator('#settings-x-target')).toHaveValue('@ka1note_D');
  await expect(page.locator('#settings-ig-target')).toHaveValue('ka1note');
});
