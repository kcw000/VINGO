import { test, expect, settings, saveSettings, stored, lockCard, waitForImportedReload } from './helpers.js';
import { baseURL } from '../paths.mjs';

const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const invalidCases = [
  { name: 'JSONが不正', code: Buffer.from('{broken').toString('base64url'), error: 'データ形式' },
  { name: 'Base64URLが不正', code: 'invalid%%%', error: 'デコード失敗' },
  { name: '設定全体がnull', value: null, error: '無効なデータ形式' },
  { name: '設定全体が配列', value: [], error: '無効なデータ形式' },
  { name: '未対応バージョン', value: settings(9, { v: 2 }), error: 'バージョン' },
  { name: 'バージョンが文字列', value: settings(9, { v: '1' }), error: 'バージョン' },
  { name: '主催者名が数値', value: settings(9, { organizerName: 42 }), error: '主催者名' },
  { name: 'イベント名が数値', value: settings(9, { eventName: 42 }), error: 'イベント名' },
  { name: 'X送付先が配列', value: settings(9, { xTarget: ['@example'] }), error: 'X送付先' },
  { name: 'Instagram送付先が配列', value: settings(9, { igTarget: ['example'] }), error: 'Instagram送付先' },
  { name: '候補曲がオブジェクト', value: settings(9, { songs: { length: 9 } }), error: '曲リスト' },
  { name: '候補曲が文字列', value: settings(9, { songs: '文字列の候補曲リスト' }), error: '曲リスト' },
  { name: '候補曲がfalse', value: settings(9, { songs: false }), error: '曲リスト' },
  { name: '候補曲が数値0', value: settings(9, { songs: 0 }), error: '曲リスト' },
  { name: '候補曲が空文字', value: settings(9, { songs: '' }), error: '曲リスト' },
  { name: '曲名に非文字列が混在', value: settings(9, { songs: [...settings(9).songs, 42] }), error: '曲名' },
  { name: 'イベント名が31文字', value: settings(9, { eventName: '名'.repeat(31) }), error: '30文字以内' },
  { name: '主催者名が21文字', value: settings(9, { organizerName: '名'.repeat(21) }), error: '20文字以内' },
  { name: '候補曲が空配列', value: settings(9, { songs: [] }), error: '9曲以上必要' },
  { name: '空欄を除くと候補曲が8曲', value: settings(8, { songs: [...settings(8).songs, '  '] }), error: '9曲以上必要' },
];

for (const mode of ['URL自動読み込み', 'リンク貼り付け']) {
  for (const item of invalidCases) {
    test(`BUG-003：${item.name}を保存前に拒否（${mode}）`, async ({ page, audit }) => {
      // Observe every attempted write, including writes which might later be rolled back.
      await page.addInitScript(() => {
        window.settingsWrites = [];
        const setItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
          if (this === localStorage && ['vingo_settings_json', 'vingo_event_name'].includes(key)) {
            window.settingsWrites.push(key);
          }
          return setItem.call(this, key, value);
        };
      });
      await page.goto('./');
      const previous = settings(9);
      await saveSettings(page, previous);
      await page.locator('#settings-close').click();
      const previousStorage = await page.evaluate(() => ({ ...localStorage }));
      await page.evaluate(() => { window.settingsWrites = []; });
      const code = item.code ?? encode(item.value);
      const url = `${baseURL}?v=1&cfg=${encodeURIComponent(code)}`;
      if (mode === 'URL自動読み込み') {
        await page.goto(url);
      } else {
        await page.locator('#btn-input-link').click();
        await page.locator('#load-code-input').fill(url);
        await page.locator('#btn-do-load').click();
      }

      // Keep BUG-003's original acceptance assertion; it is now a normal test.
      expect({ saved: await stored(page), errors: audit.errors }).toEqual({ saved: previous, errors: [] });
      expect(await page.evaluate(() => window.settingsWrites)).toEqual([]);
      expect(await page.evaluate(() => ({ ...localStorage }))).toEqual(previousStorage);
      await expect(page.locator('#toast')).toHaveClass(/error/);
      await expect(page.locator('#toast')).toContainText(item.error);
      await expect(page.locator('#event-name-text')).toHaveText(previous.eventName);
      // BUG-007 still governs whether the failed paste leaves its modal open.
      if (await page.locator('#settings-modal').isVisible()) await page.locator('#settings-close').click();
      await lockCard(page);
      expect((await page.locator('#grid .cell span').allTextContents()).sort()).toEqual([...previous.songs].sort());
      // A fresh clean URL must still load the previous valid configuration.
      await page.goto(baseURL);
      expect(await stored(page)).toEqual(previous);
      await expect(page.locator('#event-name-text')).toHaveText(previous.eventName);
      await lockCard(page);
    });
  }
}

// These omissions and input forms were accepted before BUG-003 was fixed.
const defaults = { v: 1, eventName: 'VINGO EVENT', organizerName: '', xTarget: '@ka1note_D', igTarget: 'ka1note', songs: null };
const { v, organizerName, xTarget, igTarget, ...legacy } = settings(9);
const { songs, ...withoutSongs } = settings(9);
const validCases = [
  { name: '入力上限ちょうどのイベント名30文字・主催者名20文字', value: settings(9, { eventName: '名'.repeat(30), organizerName: '主'.repeat(20) }) },
  { name: 'vと任意の文字項目を省略した旧形式（c）', value: legacy, key: 'c' },
  { name: '候補曲を省略した旧形式（settings）', value: withoutSongs, key: 'settings' },
  { name: '初期候補曲null', value: settings(9, { songs: null }) },
  { name: '文字項目がすべて空欄', value: settings(9, { eventName: '', organizerName: '', xTarget: '', igTarget: '' }) },
  { name: '全項目省略で既定値を使う旧形式', value: {} },
  { name: 'パディング付きBase64を生の設定コードとして貼付', value: settings(9), raw: true },
];

for (const item of validCases) {
  test(`BUG-003互換：${item.name}`, async ({ page }) => {
    await page.goto('./');
    await saveSettings(page, settings(50, { eventName: '読み込み前の架空設定' }));
    await page.locator('#settings-close').click();
    const expected = { ...defaults, ...item.value };
    const code = item.raw ? Buffer.from(JSON.stringify(item.value)).toString('base64') : encode(item.value);
    if (item.raw) {
      await page.locator('#btn-input-link').click();
      await page.locator('#load-code-input').fill(code);
      await waitForImportedReload(page, () => page.locator('#btn-do-load').click());
    } else {
      await page.goto(`${baseURL}?${item.key ?? 'cfg'}=${encodeURIComponent(code)}`);
      await waitForImportedReload(page, async () => {});
    }
    expect(await stored(page)).toEqual(expected);
    await expect(page).toHaveURL(baseURL);
    if (expected.eventName) await expect(page.locator('#event-name-text')).toHaveText(expected.eventName);
    await lockCard(page);
    const titles = await page.locator('#grid .cell span').allTextContents();
    expect(new Set(titles).size).toBe(9);
    if (expected.songs) expect(titles.every(title => expected.songs.includes(title))).toBe(true);
    else expect(titles.every(title => !title.startsWith('検証用楽曲'))).toBe(true);
  });
}
