import { artifacts } from './paths.mjs';

export default class JapaneseReporter {
  counts = { passed: 0, known: 0, unexpected: 0, unexpectedPass: 0, skipped: 0 };
  onBegin(_, suite) { console.log(`実行開始：${suite.allTests().length}件（ワーカー1・再試行なし）`); }
  onTestEnd(test, result) {
    const known = test.parent.project().name === 'known-issues';
    const id = test.title.match(/(?:BUG|IMP)-\d{3}/)?.[0];
    // Only the targeted acceptance assertion counts as a known failure.
    const expectedFailure = known && test.expectedStatus === 'failed' && result.status === 'failed' && result.errors.length === 1
      && result.errors[0].message?.startsWith(`Error: [${id} acceptance] `);
    if (expectedFailure) {
      this.counts.known++;
      console.log(`期待失敗（未解決）：${test.title}`);
    } else if (result.status === 'passed' && known) {
      this.counts.unexpectedPass++;
      console.log(`改善を検出（分類の見直しが必要）：${test.title}`);
    } else if (result.status === 'passed') {
      this.counts.passed++;
      console.log(`合格：${test.title}`);
    } else if (result.status === 'skipped') {
      this.counts.skipped++;
    } else {
      this.counts.unexpected++;
      console.log(`想定外の失敗：${test.title}\n${result.errors.map(e => e.message).join('\n')}`);
    }
  }
  onEnd(result) {
    console.log(`結果：正常合格 ${this.counts.passed} / 既知課題の失敗 ${this.counts.known} / 想定外失敗 ${this.counts.unexpected} / 改善検出 ${this.counts.unexpectedPass} / 未実施 ${this.counts.skipped}`);
    console.log(`JSON・失敗時画像・trace：${artifacts}`);
    // Do not let test.fail mask a timeout, setup/teardown error or unexpected pass.
    if (this.counts.unexpected || this.counts.unexpectedPass || this.counts.skipped) return { status: 'failed' };
    return { status: result.status };
  }
}
