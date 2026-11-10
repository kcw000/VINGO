import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test, expect } from './helpers.js';
import { checkPages } from '../scripts/check-pages.mjs';
import { repo } from '../paths.mjs';

test('Pages配置ガードとローカルサーバーの配信許可リスト', async ({ request }) => {
  expect(checkPages()).toContain('合格');
  for (const file of ['index.html', 'ogp.png']) {
    const response = await request.get(file);
    expect(response.status()).toBe(200);
    expect(await response.body()).toEqual(await readFile(path.join(repo, file)));
  }
  for (const file of ['package.json', '_tests/package.json', '_tests/package-lock.json', '_tests/specs/game.spec.js', '_tests/node_modules/@playwright/test/package.json', '../.git/config', 'test-results/results.json']) {
    expect((await request.get(file)).status(), file).toBe(404);
  }
});
