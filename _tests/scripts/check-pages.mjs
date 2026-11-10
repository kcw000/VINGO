import assert from 'node:assert/strict';
import { existsSync, readdirSync, lstatSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { repo } from '../paths.mjs';

export function checkPages() {
  // Fail closed if the reviewed, config-free Jekyll premise changes.
  for (const file of ['.nojekyll', '_config.yml', '_config.yaml', '_plugins', '.github/workflows']) {
    assert(!existsSync(path.join(repo, file)), `${file} が追加されています。Pagesの除外条件を再確認してください。`);
  }
  const allowed = new Set(['.git', '.gitignore', '_tests', 'docs', 'README.md', 'AGENTS.md', 'CHANGELOG.md', 'index.html', 'ogp.png']);
  for (const entry of readdirSync(repo)) {
    assert(allowed.has(entry), `未審査のルートファイル: ${entry}`);
  }
  assert(!lstatSync(path.join(repo, '_tests')).isSymbolicLink(), '_tests must be a real directory');
  for (const file of ['package.json', 'package-lock.json', 'playwright.config.js', 'specs', 'scripts']) {
    assert(existsSync(path.join(repo, '_tests', file)), `Missing _tests/${file}`);
  }
  return 'Pages配置ガード合格：テスト一式は標準除外対象 _tests/ 内。公開設定の追加なし。';
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(checkPages());
