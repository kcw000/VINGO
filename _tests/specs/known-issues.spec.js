import { test, expect, expectKnownIssue, settings, saveSettings, fillSettings, shareUrl, decodeLink, stored, lockCard, mark } from './helpers.js';
import { baseURL } from '../paths.mjs';

// Separate project; expectKnownIssue marks only the final acceptance assertion as test.fail.
test.beforeEach(async ({ page }) => { await page.goto('./'); });

test('BUG-001：301曲の新規保存を拒否し、直前の有効設定を保つ', async ({ page }) => {
  const previous = settings(9);
  await saveSettings(page, previous);
  await fillSettings(page, settings(301));
  await page.locator('#settings-save').click();
  const actual = { saved: await stored(page), error: await page.locator('#toast').evaluate(el => el.classList.contains('error')) };
  expectKnownIssue(actual, 'BUG-001', '超過保存を拒否する').toEqual({ saved: previous, error: true });
});

test('BUG-001：既存301曲リンクを無通知で300曲へ切り詰めない', async ({ page }) => {
  const previous = settings(9);
  await saveSettings(page, previous);
  await page.locator('#settings-close').click();
  await page.locator('#btn-input-link').click();
  const code = Buffer.from(JSON.stringify(settings(301))).toString('base64url');
  await page.locator('#load-code-input').fill(`${baseURL}?v=1&cfg=${code}`);
  await page.locator('#btn-do-load').click();
  expectKnownIssue({ saved: await stored(page), error: await page.locator('#toast').evaluate(el => el.classList.contains('error')) }, 'BUG-001', '旧超過データは説明して拒否し既存値を保つ').toEqual({ saved: previous, error: true });
});

for (const theme of ['ren', 'luka', 'meiko']) {
  test(`BUG-002：${theme}の成立ライン曲名のコントラスト比4.5以上`, async ({ page }) => {
    await page.locator(`[data-theme="theme-${theme}"]`).click();
    await lockCard(page);
    await mark(page, [0, 1, 2]);
    await expect(page.locator('#grid .bingo-line')).toHaveCount(3);
    const ratio = await page.locator('#grid .bingo-line span').first().evaluate(span => {
      const rgba = str => str.match(/[\d.]+/g).map(Number);
      const over = (fg, bg) => fg.slice(0, 3).map((v, i) => v * (fg[3] ?? 1) + bg[i] * (1 - (fg[3] ?? 1)));
      let background = [255, 255, 255];
      const ancestors = [];
      for (let el = span; el; el = el.parentElement) ancestors.unshift(el);
      for (const el of ancestors) background = over(rgba(getComputedStyle(el).backgroundColor), background);
      const foreground = over(rgba(getComputedStyle(span).color), background);
      const luminance = rgb => rgb.map(c => c / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4)
        .reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
      const a = luminance(foreground), b = luminance(background);
      return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    });
    expectKnownIssue(ratio, 'BUG-002', '通常サイズの曲名を読める配色にする').toBeGreaterThanOrEqual(4.5);
  });
}

test.describe('不正な共有設定', () => {
  test.use({ allowMalformedSettingsError: true });
  test('BUG-003：型不正を保存前に拒否し例外停止しない', async ({ page, audit }) => {
    const previous = settings(9);
    await saveSettings(page, previous);
    await page.locator('#settings-close').click();
    await page.locator('#btn-input-link').click();
    const code = Buffer.from(JSON.stringify(settings(9, { organizerName: 42 }))).toString('base64url');
    await page.locator('#load-code-input').fill(`${baseURL}?v=1&cfg=${code}`);
    await page.locator('#btn-do-load').click();
    expectKnownIssue({ saved: await stored(page), errors: audit.errors }, 'BUG-003', '型検証で既存設定と動作を保護する')
      .toEqual({ saved: previous, errors: [] });
  });
});

test('BUG-004：同名9行を9種類の曲として保存しない', async ({ page }) => {
  const previous = settings(9);
  await saveSettings(page, previous);
  await fillSettings(page, settings(9, { songs: Array(9).fill('重複した架空曲') }));
  await page.locator('#settings-save').click();
  expectKnownIssue({ saved: await stored(page), error: await page.locator('#toast').evaluate(el => el.classList.contains('error')) }, 'BUG-004', '異なる曲が9曲未満なら保存を拒否する').toEqual({ saved: previous, error: true });
});

test('BUG-005：上部で変更したイベント名を共有・再読み込みにも反映', async ({ page }) => {
  await saveSettings(page, settings(9));
  await page.locator('#settings-close').click();
  await page.locator('#event-name-display').click();
  await page.locator('#event-name-input').fill('上部から変更した名前');
  await page.locator('#event-name-save').click();
  await expect(page.locator('#event-name-text')).toHaveText('上部から変更した名前');
  await page.locator('#settings-btn').click();
  const exported = decodeLink(await shareUrl(page));
  await page.reload();
  expectKnownIssue({ shared: exported.eventName, reloaded: await page.locator('#event-name-text').innerText() }, 'BUG-005', '編集経路間で同じ名前を保持する').toEqual({ shared: '上部から変更した名前', reloaded: '上部から変更した名前' });
});

test('BUG-006：保存容量不足では成功通知せず、入力と既存値を保持', async ({ page }) => {
  const previous = settings(9), edited = settings(50);
  await saveSettings(page, previous);
  await fillSettings(page, edited);
  await page.evaluate(() => {
    Storage.prototype.setItem = function () { throw new DOMException('Synthetic test quota', 'QuotaExceededError'); };
  });
  await page.locator('#settings-save').click();
  expectKnownIssue({ saved: await stored(page), error: await page.locator('#toast').evaluate(el => el.classList.contains('error')),
    input: await page.locator('#settings-songs').inputValue() }, 'BUG-006', '保存失敗を成功として通知しない')
    .toEqual({ saved: previous, error: true, input: edited.songs.join('\n') });
});

test('BUG-007：壊れた共有リンクでも入力モーダルと入力を残す', async ({ page }) => {
  await page.locator('#btn-input-link').click();
  const invalid = `${baseURL}?cfg=invalid%%%`;
  await page.locator('#load-code-input').fill(invalid);
  await page.locator('#btn-do-load').click();
  await expect(page.locator('#toast')).toHaveClass(/error/);
  expectKnownIssue({ visible: await page.locator('#settings-modal').isVisible(), input: await page.locator('#load-code-input').inputValue() }, 'BUG-007', '入力内容を保持して再入力可能にする').toEqual({ visible: true, input: invalid });
});

test('IMP-001：同じイベントの再読み込みでカード・チェック・成立日時を復元', async ({ page }) => {
  await saveSettings(page, settings(9));
  await page.locator('#settings-close').click();
  await lockCard(page);
  await mark(page, [0, 1, 2, 4]);
  await expect(page.locator('#vingo-banner')).toBeVisible();
  const snapshot = async () => ({
    songs: await page.locator('#grid .cell span').allTextContents(),
    marks: await page.locator('#grid .cell').evaluateAll(cells => cells.map(c => c.classList.contains('marked'))),
    locked: await page.locator('#btn-random').isDisabled(),
    timestamp: await page.locator('#vingo-timestamp').innerText(),
    bingo: await page.locator('#vingo-banner').isVisible(),
  });
  const before = await snapshot();
  await page.reload();
  expectKnownIssue(await snapshot(), 'IMP-001', 'イベント途中のカードを再開できる').toEqual(before);
});
