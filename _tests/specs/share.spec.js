import { test, expect, settings, saveSettings, shareUrl, decodeLink, stored, lockCard, waitForImportedReload, prepareContext, fixedTime } from './helpers.js';
import { baseURL } from '../paths.mjs';

for (const count of [9, 50, 300]) {
  for (const mode of ['URL自動読み込み', 'リンク貼り付け']) {
    test(`${count}曲の共有生成と別BrowserContextへの${mode}・日本語保持`, async ({ page, context }) => {
      await page.goto('./');
      const data = settings(count);
      await saveSettings(page, data);
      const url = await shareUrl(page);
      expect(decodeLink(url)).toEqual(data);
      // Reuse the runner's configured viewport, locale, timezone and isolation options.
      const recipient = await context.browser().newContext({ viewport: { width: 390, height: 844 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo', serviceWorkers: 'block' });
      const { errors, consoleErrors, external } = await prepareContext(recipient);
      try {
        const other = await recipient.newPage();
        await other.clock.setFixedTime(fixedTime);
        await other.goto(baseURL);
        expect(await stored(other)).toBeNull();
        if (mode === 'URL自動読み込み') {
          await other.goto(url);
          // The initial navigation already completed. Wait for the application's reload.
          await waitForImportedReload(other, async () => {});
        } else {
          await other.locator('#btn-input-link').click();
          await other.locator('#load-code-input').fill(url);
          await waitForImportedReload(other, () => other.locator('#btn-do-load').click());
        }
        await expect(other).toHaveURL(baseURL);
        expect(await stored(other)).toEqual(data);
        await expect(other.locator('#event-name-text')).toHaveText(data.eventName);
        await lockCard(other);
        const songs = await other.locator('#grid .cell span').allTextContents();
        expect(songs.every(song => data.songs.includes(song))).toBe(true);
        expect(songs.join('')).not.toContain('�');
        expect(await stored(page)).toEqual(data);
        expect(errors).toEqual([]);
        expect(consoleErrors).toEqual([]);
        expect(external).toEqual([]);
      } finally { await recipient.close(); }
    });
  }
}
