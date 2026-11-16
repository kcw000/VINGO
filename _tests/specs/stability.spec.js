import { gzipSync } from 'node:zlib';
import { test, expect, settings, saveSettings, fillSettings, shareUrl, decodeLink, stored, lockCard, mark, waitForImportedReload, acceptReset, openSettings } from './helpers.js';
import { baseURL } from '../paths.mjs';

// Resolved acceptance tests now run normally, without test.fail or skipped assertions.
test.beforeEach(async ({ page }) => { await page.goto('./'); });

test('BUG-001：301曲の新規保存を拒否し、直前の有効設定を保つ', async ({ page }) => {
  const previous = settings(9);
  await saveSettings(page, previous);
  await fillSettings(page, settings(301));
  await page.locator('#settings-save').click();
  const actual = { saved: await stored(page), error: await page.locator('#toast').evaluate(el => el.classList.contains('error')) };
  expect(actual, 'BUG-001: 超過保存を拒否する').toEqual({ saved: previous, error: true });
});

test('BUG-001：既存301曲リンクを無通知で300曲へ切り詰めない', async ({ page }) => {
  const previous = settings(9);
  await saveSettings(page, previous);
  await page.locator('#settings-close').click();
  await page.locator('#btn-input-link').click();
  const code = Buffer.from(JSON.stringify(settings(301))).toString('base64url');
  await page.locator('#load-code-input').fill(`${baseURL}?v=1&cfg=${code}`);
  await page.locator('#btn-do-load').click();
  expect({ saved: await stored(page), error: await page.locator('#toast').evaluate(el => el.classList.contains('error')) }, 'BUG-001: 旧超過データは説明して拒否し既存値を保つ').toEqual({ saved: previous, error: true });
});

for (const theme of ['simple', 'miku', 'rin', 'ren', 'luka', 'meiko', 'kaito']) {
  test(`BUG-002：${theme}の成立ライン曲名のコントラスト比4.5以上`, async ({ page }) => {
    await page.locator(`[data-theme="theme-${theme}"]`).click();
    await lockCard(page);
    await mark(page, [0, 1, 2]);
    await expect(page.locator('#grid .bingo-line')).toHaveCount(3);
    const targets = ['#grid .bingo-line span'];
    if (['ren', 'luka', 'meiko'].includes(theme)) targets.push('.sns-title', '#vingo-timestamp');
    for (const selector of targets) {
    const ratio = await page.locator(selector).first().evaluate(span => {
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
    expect(ratio, `BUG-002: ${theme} ${selector}を読める配色にする`).toBeGreaterThanOrEqual(4.5);
    }
  });
}

test('BUG-004：同名9行を9種類の曲として保存しない', async ({ page }) => {
  const previous = settings(9);
  await saveSettings(page, previous);
  await fillSettings(page, settings(9, { songs: Array(9).fill('重複した架空曲') }));
  await page.locator('#settings-save').click();
  expect({ saved: await stored(page), error: await page.locator('#toast').evaluate(el => el.classList.contains('error')) }, 'BUG-004: 異なる曲が9曲未満なら保存を拒否する').toEqual({ saved: previous, error: true });
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
  expect({ shared: exported.eventName, reloaded: await page.locator('#event-name-text').innerText() }, 'BUG-005: 編集経路間で同じ名前を保持する').toEqual({ shared: '上部から変更した名前', reloaded: '上部から変更した名前' });
});

test('BUG-006：保存容量不足では成功通知せず、入力と既存値を保持', async ({ page }) => {
  const previous = settings(9), edited = settings(50);
  await saveSettings(page, previous);
  await fillSettings(page, edited);
  await page.evaluate(() => {
    Storage.prototype.setItem = function () { throw new DOMException('Synthetic test quota', 'QuotaExceededError'); };
  });
  await page.locator('#settings-save').click();
  expect({ saved: await stored(page), error: await page.locator('#toast').evaluate(el => el.classList.contains('error')),
    input: await page.locator('#settings-songs').inputValue() }, 'BUG-006: 保存失敗を成功として通知しない')
    .toEqual({ saved: previous, error: true, input: edited.songs.join('\n') });
});

test('BUG-007：壊れた共有リンクでも入力モーダルと入力を残す', async ({ page }) => {
  await page.locator('#btn-input-link').click();
  const invalid = `${baseURL}?cfg=invalid%%%`;
  await page.locator('#load-code-input').fill(invalid);
  await page.locator('#btn-do-load').click();
  await expect(page.locator('#toast')).toHaveClass(/error/);
  expect({ visible: await page.locator('#settings-modal').isVisible(), input: await page.locator('#load-code-input').inputValue() }, 'BUG-007: 入力内容を保持して再入力可能にする').toEqual({ visible: true, input: invalid });
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
  expect(await snapshot(), 'IMP-001: イベント途中のカードを再開できる').toEqual(before);
});

const progress = page => page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([k]) => k.startsWith('vingo_progress_v1:'))));
const board = page => page.evaluate(() => ({ grid: state.grid, marks: state.marks, locked: state.locked, bingo: state.bingo, achievedAt: state.bingoAchievedAt?.toISOString() ?? null }));
const oldLink = data => `${baseURL}?v=1&cfg=${Buffer.from(JSON.stringify(data)).toString('base64url')}`;
async function importLink(page, url) {
  await page.locator('#btn-input-link').click();
  await page.locator('#load-code-input').fill(url);
  await waitForImportedReload(page, () => page.locator('#btn-do-load').click());
}

for (const locked of [false, true]) {
  test(`IMP-001：${locked ? '確定・途中チェック' : '未確定'}を復元し、盤面リセットは設定とテーマを保つ`, async ({ page }) => {
    const data = settings(50);
    await saveSettings(page, data);
    await page.locator('#settings-close').click();
    await page.locator('[data-theme="theme-luka"]').click();
    await page.locator('#btn-random').click();
    if (locked) { await page.locator('#btn-lock').click(); await mark(page, [1, 3]); }
    const before = await board(page);
    await page.reload();
    expect(await board(page)).toEqual(before);
    expect(await page.locator('#btn-random').isDisabled()).toBe(locked);
    await acceptReset(page, '#btn-reset');
    await page.reload();
    await expect(page.locator('#grid .empty')).toHaveCount(9);
    expect(await progress(page)).toEqual({});
    expect(await stored(page)).toEqual(data);
    await expect(page.locator('body')).toHaveClass(/theme-luka/);
  });
}

test('IMP-001：成立の復元では演出を再生せず、解除後も最初の日時を保持', async ({ page }) => {
  await lockCard(page);
  await mark(page, [0, 1, 2]);
  const before = await board(page);
  await page.reload();
  expect(await board(page)).toEqual(before);
  await expect(page.locator('#celebration-overlay')).not.toHaveClass(/visible/);
  await expect(page.locator('#confetti-canvas')).not.toHaveClass(/active/);
  await mark(page, [2]);
  await page.reload();
  expect((await board(page)).bingo).toBe(false);
  expect((await board(page)).achievedAt).toBe(before.achievedAt);
  await mark(page, [2]);
  await expect(page.locator('#celebration-overlay')).toHaveClass(/visible/);
  expect((await board(page)).achievedAt).toBe(before.achievedAt);
});

for (const withId of [false, true]) {
  test(`IMP-001：${withId ? '同一設定・異なる開催ID' : 'IDのない旧イベント'}を混ぜずA→B→Aで復元`, async ({ page }) => {
    const a = settings(9, withId ? { eventId: 'a'.repeat(32) } : { eventName: '旧イベントA' });
    const b = settings(9, withId ? { eventId: 'b'.repeat(32) } : { eventName: '旧イベントB' });
    await importLink(page, oldLink(a));
    await lockCard(page); await mark(page, [0, 4]);
    const aBoard = await board(page);
    const compactA = await page.evaluate(data => ShareCodec.compactUrl(data), a);
    await importLink(page, oldLink(b));
    await expect(page.locator('#grid .empty')).toHaveCount(9);
    await lockCard(page); await mark(page, [2, 5, 8]);
    const bBoard = await board(page);
    await importLink(page, compactA);
    expect(await board(page)).toEqual(aBoard);
    await importLink(page, oldLink(b));
    expect(await board(page)).toEqual(bBoard);
    expect(Object.keys(await progress(page))).toHaveLength(2);
  });
}

test('IMP-001：同一設定の再保存で盤面を保ち、設定変更では新しい盤面に分離', async ({ page }) => {
  const data = settings(9);
  await saveSettings(page, data); await page.locator('#settings-close').click();
  await lockCard(page); await mark(page, [4]);
  const before = await board(page);
  await saveSettings(page, data);
  expect(await board(page)).toEqual(before);
  await fillSettings(page, { ...data, eventName: '別の設定内容' });
  await page.locator('#settings-save').click();
  expect((await board(page)).grid).toEqual([]);
  expect(Object.keys(await progress(page))).toHaveLength(1);
  await fillSettings(page, data); await page.locator('#settings-save').click();
  expect(await board(page)).toEqual(before);
});

for (const corruption of ['json', 'version', 'duplicate', 'marks', 'date']) {
  test(`IMP-001：壊れた盤面（${corruption}）で停止せず元データを残す`, async ({ page }) => {
    await lockCard(page); await mark(page, [0, 1, 2]);
    const [key, value] = Object.entries(await progress(page))[0];
    const saved = JSON.parse(value);
    if (corruption === 'version') saved.v = 99;
    if (corruption === 'duplicate') saved.grid[1] = saved.grid[0];
    if (corruption === 'marks') saved.marks[0] = 'true';
    if (corruption === 'date') saved.achievedAt = null;
    const damaged = corruption === 'json' ? '{broken' : JSON.stringify(saved);
    await page.evaluate(({ key, damaged }) => localStorage.setItem(key, damaged), { key, damaged });
    await page.reload();
    await expect(page.locator('#grid .empty')).toHaveCount(9);
    expect((await progress(page))[key]).toBe(damaged);
    await expect(page.locator('#toast')).toContainText('途中経過を復元できません');
    await lockCard(page);
  });
}

test('設定破損時は既定値で操作でき、保存済み原文を削除しない', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('vingo_settings_json', '{broken'));
  await page.reload();
  await expect(page.locator('#toast')).toContainText('元データは残しています');
  await lockCard(page);
  expect(await page.evaluate(() => localStorage.getItem('vingo_settings_json'))).toBe('{broken');
});

test('BUG-001：過去の301曲保存データを残し、入力・共有・抽選から無通知で削らない', async ({ page }) => {
  const previous = settings(301);
  await page.evaluate(data => localStorage.setItem('vingo_settings_json', JSON.stringify(data)), previous);
  await page.reload();
  await page.locator('#btn-random').click();
  await expect(page.locator('#toast')).toHaveClass(/error/);
  await expect(page.locator('#grid .empty')).toHaveCount(9);
  await openSettings(page);
  await expect(page.locator('#settings-songs')).toHaveValue(previous.songs.join('\n'));
  await page.locator('#settings-share-link').click();
  await expect(page.locator('#toast')).toContainText('300曲以下');
  await expect(page.locator('#settings-songs')).toHaveValue(previous.songs.join('\n'));
  expect(await stored(page)).toEqual(previous);
});

test('BUG-004：9種類あっても重複行を通知し、空白・曲名・前の保存を勝手に変えない', async ({ page }) => {
  const previous = settings(9); await saveSettings(page, previous);
  const input = [...previous.songs, ` ${previous.songs[0]} `].join('\n');
  await page.locator('#settings-songs').fill(input);
  await page.locator('#settings-save').click();
  await expect(page.locator('#toast')).toContainText('重複');
  await expect(page.locator('#settings-songs')).toHaveValue(input);
  expect(await stored(page)).toEqual(previous);
});

test('BUG-005：旧イベント名だけの保存を移行し、名前リセットで他の設定を失わない', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('vingo_event_name', '旧名'));
  await page.reload();
  await expect(page.locator('#event-name-text')).toHaveText('旧名');
  await page.locator('#event-name-display').click();
  await page.locator('#event-name-input').fill('新名');
  await page.locator('#event-name-save').click();
  const saved = await stored(page);
  expect(saved.eventName).toBe('新名'); expect(saved.songs).toBeNull();
  await page.locator('#event-name-display').click();
  await acceptReset(page, '#event-name-reset');
  expect(await stored(page)).toEqual({ ...saved, eventName: 'VINGO EVENT' });
  await page.reload();
  await expect(page.locator('#event-name-text')).toHaveText('VINGO EVENT');
});

test('BUG-005：設定画面の空イベント名は表示・共有・再読み込みで一致', async ({ page }) => {
  const data = settings(9, { eventName: '' }); await saveSettings(page, data);
  expect(decodeLink(await shareUrl(page)).eventName).toBe('');
  await page.reload();
  await expect(page.locator('#event-name-text')).toHaveText('');
});

test('BUG-006：共有読み込みの保存失敗は入力・盤面・既存設定を保ち成功や再読込をしない', async ({ page }) => {
  const previous = settings(9); await saveSettings(page, previous);
  await page.locator('#settings-close').click(); await lockCard(page); await mark(page, [4]);
  const before = await board(page);
  await page.evaluate(() => { window.reloadSentinel = true; Storage.prototype.setItem = () => { throw new DOMException('test quota', 'QuotaExceededError'); }; });
  await page.locator('#btn-input-link').click();
  const url = oldLink(settings(50));
  await page.locator('#load-code-input').fill(url); await page.locator('#btn-do-load').click();
  await expect(page.locator('#toast')).toContainText('設定を保存できません');
  await expect(page.locator('#load-code-input')).toHaveValue(url);
  expect(await stored(page)).toEqual(previous); expect(await board(page)).toEqual(before);
  // Observe beyond the successful import's 1.5s reload delay; a reload loses this marker.
  await page.waitForTimeout(1700);
  expect(await page.evaluate(() => window.reloadSentinel)).toBe(true);
});

test('IMP-001：途中保存不可でも操作を続け、再読込で失うことを通知', async ({ page }) => {
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('test quota', 'QuotaExceededError'); }; });
  await lockCard(page); await mark(page, [0, 1, 2]);
  await expect(page.locator('#toast')).toContainText('途中経過を保存できません');
  await expect(page.locator('#vingo-banner')).toBeVisible();
});

test('IMP-001：別タブのイベント切替と盤面変更を同期し、旧カードを混ぜない', async ({ page, context }) => {
  const a = settings(9); await saveSettings(page, a); await page.locator('#settings-close').click();
  await lockCard(page); await mark(page, [1]);
  const second = await context.newPage();
  try {
    await second.goto(baseURL);
    expect(await board(second)).toEqual(await board(page));
    await mark(second, [3]);
    await expect(page.locator('#grid .marked')).toHaveCount(2);
    await saveSettings(second, settings(50, { eventName: '別タブのイベント' }));
    await expect(page.locator('#event-name-text')).toHaveText('別タブのイベント');
    await expect(page.locator('#grid .empty')).toHaveCount(9);
    expect(Object.keys(await progress(page))).toHaveLength(1);
  } finally { await second.close(); }
});

test('診断用の一時盤面を保存せず、進行中カードを保つ', async ({ page }) => {
  await lockCard(page); await mark(page, [4]);
  const saved = await progress(page), before = await board(page);
  expect(await page.evaluate(() => runDiagnostics())).toBe(true);
  expect(await progress(page)).toEqual(saved); expect(await board(page)).toEqual(before);
});

test('OGP：既存画像と公開URLのメタ情報を指定', async ({ page }) => {
  const publicURL = 'https://kcw000.github.io/VINGO/';
  for (const [selector, content] of [
    ['meta[property="og:image"]', `${publicURL}ogp.png`], ['meta[property="og:url"]', publicURL],
    ['meta[name="twitter:card"]', 'summary_large_image'],
  ]) await expect(page.locator(selector)).toHaveAttribute('content', content);
  for (const selector of ['meta[property="og:title"]', 'meta[property="og:description"]', 'meta[name="description"]']) {
    await expect(page.locator(selector)).toHaveAttribute('content', /\S/);
  }
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', publicURL);
});

const compressedLink = data => `${baseURL}?v=2&cfgz=${gzipSync(Buffer.from(JSON.stringify(data))).toString('base64url')}`;

test('圧縮URL：日本語・絵文字を可逆圧縮し、互換リンクでも同じ内容をコピー', async ({ page }) => {
  const data = settings(150, { songs: settings(150).songs.map(s => `${s}🌸「響け」`) });
  await saveSettings(page, data);
  await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => { window.copied = text; } }, configurable: true }); });
  const url = await shareUrl(page);
  expect(new URL(url).searchParams.get('v')).toBe('2');
  expect(url.length).toBeLessThan(oldLink(data).length);
  expect(decodeLink(url)).toEqual(data);
  await page.locator('#btn-copy-link').click();
  expect(await page.evaluate(() => window.copied)).toBe(url);
  await page.locator('#btn-copy-legacy').click();
  expect(await page.evaluate(() => window.copied)).toBe(oldLink(data));
  await page.locator('#settings-close').click();
  await importLink(page, url);
  expect(await stored(page)).toEqual(data);
});

for (const invalid of [
  { label: '壊れたgzip', url: `${baseURL}?v=2&cfgz=YWJjZA` },
  { label: 'Base64URLに不正文字', url: `${baseURL}?v=2&cfgz=invalid%%%` },
  { label: '未対応の外側バージョン', url: `${baseURL}?v=3&cfgz=YWJj` },
  { label: '展開上限を超過', url: compressedLink(settings(9, { xTarget: 'a'.repeat(270000) })) },
  { label: '不正なJSON', url: `${baseURL}?v=2&cfgz=${gzipSync(Buffer.from('{broken')).toString('base64url')}` },
  { label: '不正なUTF8', url: `${baseURL}?v=2&cfgz=${gzipSync(Buffer.from([255, 255])).toString('base64url')}` },
  { label: '設定型が不正', url: compressedLink(settings(9, { organizerName: 42 })) },
  { label: 'イベントIDが不正', url: compressedLink(settings(9, { eventId: ['bad'] })) },
  { label: '301曲', url: compressedLink(settings(301)) },
  { label: '重複曲', url: compressedLink(settings(9, { songs: Array(9).fill('同名') })) },
]) {
  test(`圧縮URL：${invalid.label}を拒否し、既存設定と盤面と入力を維持`, async ({ page }) => {
    const previous = settings(9); await saveSettings(page, previous);
    await page.locator('#settings-close').click(); await lockCard(page); await mark(page, [4]);
    const before = await board(page);
    await page.locator('#btn-input-link').click();
    await page.locator('#load-code-input').fill(invalid.url);
    await page.locator('#btn-do-load').click();
    await expect(page.locator('#toast')).toHaveClass(/error/);
    expect(await stored(page)).toEqual(previous); expect(await board(page)).toEqual(before);
    await expect(page.locator('#load-code-input')).toHaveValue(invalid.url);
    await expect(page.locator('#settings-modal')).toBeVisible();
  });
}

test('圧縮未対応端末：旧リンクを生成・読込でき、gzipリンクは互換リンクを案内', async ({ page }) => {
  await page.evaluate(() => { window.CompressionStream = undefined; window.DecompressionStream = undefined; });
  const data = settings(9); await saveSettings(page, data);
  expect(await shareUrl(page)).toBe(oldLink(data));
  await page.locator('#settings-close').click();
  await page.locator('#btn-input-link').click();
  await page.locator('#load-code-input').fill(compressedLink(settings(50)));
  await page.locator('#btn-do-load').click();
  await expect(page.locator('#toast')).toContainText('互換リンク');
  expect(await stored(page)).toEqual(data);
  await page.locator('#load-code-input').fill(oldLink(data));
  await waitForImportedReload(page, () => page.locator('#btn-do-load').click());
  expect(await stored(page)).toEqual(data);
});

test('圧縮生成のサイズ上限では読めないgzipを発行せず旧形式へ戻す', async ({ page }) => {
  const large = settings(9, { xTarget: 'a'.repeat(270000) });
  const url = await page.evaluate(data => ShareCodec.compactUrl(data), large);
  expect(new URL(url).searchParams.has('cfgz')).toBe(false);
  expect(decodeLink(url)).toEqual(large);
});

test('全設定リセットで新しい開催IDを発行し、現在以外のイベント盤面を保持', async ({ page }) => {
  const a = settings(9, { eventId: 'a'.repeat(32) });
  await importLink(page, oldLink(a)); await lockCard(page); await mark(page, [1]);
  const savedA = await progress(page);
  const b = settings(50, { eventId: 'b'.repeat(32) });
  await importLink(page, oldLink(b)); await lockCard(page);
  await openSettings(page);
  page.once('dialog', dialog => dialog.accept());
  await Promise.all([page.waitForEvent('load'), page.locator('#settings-reset').click()]);
  expect(await progress(page)).toEqual(savedA);
  expect(await stored(page)).toBeNull();
  const next = settings(50); await saveSettings(page, next);
  expect(next.eventId).not.toBe(a.eventId); expect(next.eventId).not.toBe(b.eventId);
  await page.locator('#settings-close').click();
  await importLink(page, oldLink(a));
  await expect(page.locator('#grid .marked')).toHaveCount(1);
});

test('BUG-006：上部名の保存失敗でも入力と盤面を維持する', async ({ page }) => {
  const data = settings(9); await saveSettings(page, data); await page.locator('#settings-close').click();
  await lockCard(page); const before = await board(page);
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('test quota', 'QuotaExceededError'); }; });
  await page.locator('#event-name-display').click();
  await page.locator('#event-name-input').fill('保存できない編集');
  await page.locator('#event-name-save').click();
  await expect(page.locator('#event-name-input')).toBeVisible();
  await expect(page.locator('#event-name-input')).toHaveValue('保存できない編集');
  await expect(page.locator('#toast')).toHaveClass(/error/);
  expect(await stored(page)).toEqual(data); expect(await board(page)).toEqual(before);
});
