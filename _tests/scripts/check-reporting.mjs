// Exercise the actual runner exit codes, including errors that test.fail could mask.
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const directory = mkdtempSync(path.join(tmpdir(), 'vingo-reporting-check-'));
const helper = new URL('../specs/helpers.js', import.meta.url).href;
const reporter = fileURLToPath(new URL('../reporter.mjs', import.meta.url));
const cli = fileURLToPath(new URL('../node_modules/@playwright/test/cli.js', import.meta.url));
const browsers = fileURLToPath(new URL('../.browsers', import.meta.url));
writeFileSync(path.join(directory, 'probe.spec.mjs'), `
import { test, expect, expectKnownIssue } from ${JSON.stringify(helper)};
test('BUG-900 expected acceptance', () => {
  expectKnownIssue(false, 'BUG-900', 'probe').toBe(true);
});
test('BUG-901 unexpected pass', () => {
  expectKnownIssue(true, 'BUG-901', 'probe').toBe(true);
});
test('BUG-902 setup failure', () => {
  expect(false, 'setup failure').toBe(true);
  expectKnownIssue(false, 'BUG-902', 'probe').toBe(true);
});
test('BUG-903 unrelated failure after annotation', () => {
  test.fail(true, 'simulate an unrelated failure after the marker');
  expect(false, 'unrelated error; not the acceptance assertion').toBe(true);
});
test.describe('teardown', () => {
  test.afterEach(() => { expect(false, 'teardown failure').toBe(true); });
  test('BUG-904 teardown failure', () => {
    expectKnownIssue(false, 'BUG-904', 'probe').toBe(true);
  });
});
`);
const config = path.join(directory, 'playwright.config.mjs');
writeFileSync(config, `export default ${JSON.stringify({
  testDir: directory, testMatch: '**/probe.spec.mjs', workers: 1, retries: 0, timeout: 10000,
  reporter: [[reporter]], outputDir: path.join(directory, 'output'),
  projects: [{ name: 'known-issues', use: { browserName: 'chromium', headless: true } }],
})};`);

for (const [id, expectedCode] of [['BUG-900', 0], ['BUG-901', 1], ['BUG-902', 1], ['BUG-903', 1], ['BUG-904', 1]]) {
  const result = spawnSync(process.execPath, [cli, 'test', '--config', config, '--grep', id], {
    encoding: 'utf8', env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browsers },
  });
  writeFileSync(path.join(directory, `${id}.log`), `${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  assert.equal(result.status, expectedCode, `${id}: expected exit ${expectedCode}; evidence ${directory}`);
  const message = id === 'BUG-900' ? '期待失敗（未解決）' : id === 'BUG-901' ? '改善を検出' : '想定外の失敗';
  assert(result.stdout.includes(message), `${id}: wrong classification; evidence ${directory}`);
  console.log(`${id}: 終了コード${result.status}・分類確認 合格`);
}
console.log(`レポート機構の5確認 合格。これはVINGOの66ケースとは別。証拠：${directory}`);
