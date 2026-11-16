# VINGO 自動テスト

アプリ本体を変更せず、ローカルHTTPサーバーと一時Chromiumで操作を確認する。外部DB・有料サービス・追加のサーバーフレームワークは使わない。

## 前提と初回準備

- 推奨：Node.js **24 LTSの最新パッチ**と付属npm。公式Playwright要件は最新22 / 24 / 26系、macOS 14以降。Windows / Linuxの条件は公式資料を参照する。
- このプロジェクトのnpm下限は10。Playwright公式のnpm下限という意味ではなく、lockfileを扱う開発環境の条件。
- 確認済み：Intel Mac、macOS 15.7.9、Node.js 24.22.2、npm 11.19.1、Playwright Test 1.65.0。
- PlaywrightはdevDependenciesに正確な版を指定し、推移依存もlockfileで固定する。アプリのHTMLから読み込まない。

リポジトリのルートから実行する。

```sh
cd _tests
npm ci --ignore-scripts
npm run install:browser
npm test
```

`install:browser`はChromium **headless shellのみ**をプロジェクト専用`.browsers/`へ入れる。Playwrightが必要とするFFmpegも入るが、動画記録は無効。画面付き実行やWebKit / Firefoxは未導入。

今回のMacはPATH上にNodeがなかったため、公式macOS x64配布のNode.jsをSHA-256照合後、Git除外の`_tests/.runtime/`へ配置した。システム設定やシェル設定は変更していない。このMacでは、ルートから次のラッパーを使える。

```sh
sh _tests/run.sh test
sh _tests/run.sh run test:known
sh _tests/run.sh run test:all
```

ラッパーは`.runtime/bin/node`があるときだけ利用し、なければ通常のPATHを使う。別PCではそのOS・CPU用の公式Nodeを導入する。`.runtime`をGitで共有せず、Codex等の同梱ランタイムにも依存しない。WindowsはNode導入後、`_tests`内で直接npmを実行する。

## 実行と結果の読み方

| コマンド（`_tests`内） | 対象 | 終了コード |
|---|---|---|
| `npm test` | 正常系102件（従来55件＋BUG-003の拒否・互換47件） | 全件合格なら0 |
| `npm run test:known` | 残る6不具合＋盤面復元の10ケース | 想定どおりの期待失敗だけなら0 |
| `npm run test:all` | 両方112件 | 正常系合格＋想定どおりの期待失敗なら0 |
| `npm run check:pages` | 公開除外の前提と配置のガード | 前提を満たせば0 |
| `npm run check:reporting` | 判定機構の5パターン（アプリ112件とは別） | 期待失敗・予期しない成功・別エラーの終了コードが正しければ0 |
| `npm test -- --grep 'カード確定'` | 名前で絞った正常系 | 対象の結果による |

**期待失敗は不具合の受入合格ではない。** 既知課題は別プロジェクトで毎回実行し、準備操作の後、最後の受入assertに限って`expectKnownIssue()`経由でPlaywrightの`test.fail()`を指定する。準備の失敗をまとめて期待失敗にせず、skipもしない。専用レポーターは対象ID付き受入assertだけを「期待失敗（未解決）」と数える。終了コード0は「正常系が通り、既知課題も指定した受入条件で失敗した」ことを表し、不具合解消を意味しない。

タイムアウト・別のJS例外・後片付けの失敗はレポーターでも確認し、終了コード1にする。既知課題が成功した場合もPlaywrightが予期しない成功として検出し、終了コード1にする。標準JSONの`expected`には期待失敗が含まれるため、`projectName`と`expectedStatus`、実行結果の`status`、対象ID付きエラーで正常合格と区別する。別エラーを`test.fail()`が期待失敗扱いした場合でも、専用レポーターが実行全体を失敗へ戻す。

修正後は、そのテストを`known-issues.spec.js`から適切な正常系ファイルへ移し、`expectKnownIssue`を通常の`expect`へ戻す。課題ID・望ましい期待値を残して、両コマンドの件数と管理文書を更新する。不具合の挙動を合格条件にしない。[Playwrightの期待失敗](https://playwright.dev/docs/test-annotations)

## 対象と証拠

| ファイル | 検証内容 |
|---|---|
| `specs/game.spec.js` | 初期表示、抽選・重複なし、確定、チェック解除、8ライン、512状態の独立判定、複数ライン、盤面リセット |
| `specs/settings.spec.js` | 9 / 50 / 300曲、イベント・主催者・SNS設定、再読み込み、SNS非表示、全設定リセット |
| `specs/share.spec.js` | 生成データ、URL自動読み込み／貼付、別BrowserContext、日本語の保持 |
| `specs/share-validation.spec.js` | BUG-003。不正入力20種類×2経路で保存前の拒否・既存設定保持・操作継続、正常・旧形式7ケースの互換性 |
| `specs/display.spec.js` | 7テーマ×320 / 390 / 768 / 1440px、保存、盤面の配置、設定・共有画面、達成日時、SNS案内、演出中の操作 |
| `specs/known-issues.spec.js` | BUG-001を2経路、BUG-002を3テーマ、BUG-004〜007、IMP-001を各1ケース |
| `specs/environment.spec.js` | Pagesの配置前提、サーバーの許可リスト、HTML・画像の配信内容一致 |

通常のテストはDOM操作を中心とする。512状態は既存の判定関数をブラウザ内で呼び、テスト側の座標による別の計算と照合する。アプリへテストAPIを追加しない。画面幅のチェックは横あふれ・マスの重なり・モーダル位置・操作を確認し、すべての視覚品質やアクセシビリティの合格を保証するものではない。

BUG-002の基準は通常サイズの文字について4.5:1以上。文字色と透過背景を合成して計算する簡易検査であり、影・グラデーション・画面全体の適合を判定しない。[W3Cのコントラスト基準](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)

出力先はOSの一時フォルダ下`vingo-playwright/<作業フォルダの識別値>/`で、毎回コンソールに表示する。`results.json`に全結果、`results/`に想定外失敗時の画像・trace、`visual/`に28枚の画面記録を保存する。期待失敗ではPlaywrightが画像・traceを保持しないため、対象IDとJSON内のassert結果を確認する。画像は正解スナップショットではなく観測用。既知の読みにくさを画像一致で合格させない。

結果JSONと失敗記録は次の実行で置換され、画面記録は同名で更新される。比較用に残す場合だけ外へコピーする。一時フォルダはOSが消すことがあるので、検証の要点は`docs/TEST_CHECKLIST.md`へ記録する。画像・traceに架空設定が含まれるため、実イベントデータで実行しない。

## データと通信の隔離

- テストごとに一時BrowserContext。永続プロファイル・storageState・普段のChromeやSafariは使わない。
- 共有の受け手も独立したBrowserContext。同じChromiumエンジン内の隔離であり、Safariとの互換確認ではない。
- `127.0.0.1:4178/VINGO/`だけを使い、同ポートが使用中なら失敗する。他のサーバーを再利用しない。
- サーバーは`index.html`と`ogp.png`のみ配信。その他のパスは404。
- ブラウザの外部通信を遮断。SNSはhrefと表示だけを検査し、リンクの実操作・DM送信はしない。
- データは架空イベント・架空曲・架空SNS名、またはアプリ内蔵の初期値。利用者の保存データは読み込まない。
- テストごとに同じシードの疑似乱数と固定日時を設定。受け手のContextも同じ日本語ロケール・東京タイムゾーン・画面幅・通信隔離にそろえる。演出試験だけ時計全体を手動で進める。乱数を固定しても特定の並び順は期待値にせず、9件・候補内・重複なしを確認する。
- 保存失敗の再現は専用ページ内のStorage APIだけに障害を注入し、そのContext終了とともに破棄する。

## GitHub Pagesとの分離

2026-11-09確認時のPagesは`main`のルート、`build_type: legacy`。Jekyllでは先頭が`_`の通常ディレクトリが標準除外されるため、package.json・lockfile・設定・テスト・依存・ブラウザをすべて`_tests/`に置く。`.gitignore`は依存・バイナリ・キャッシュのGit登録防止であり、Pages除外の根拠ではない。

2026-11-10、Pages採用版Jekyll 3.10.0で実際のローカルビルドも実施した。出力は既存の管理文書5件とHTML・画像の計7件のみ。`_tests/`配下のテスト・設定・依存・ブラウザは一切含まれず、HTML・画像は入力とバイト一致した。ビルド用Ruby依存は一時フォルダに置き、通常のnpm依存や公開設定には追加していない。

これは現行の設定ファイルなしのサイトをJekyll 3.10.0でビルドした結果であり、GitHub側の全プラグインや本番配信の再現ではない。公開設定を変えずにテスト一式が除外されることを、規則と実出力の両方で確認している。GitHub上の公開リポジトリには、commit・pushしたテストソース自体は表示される。Pagesの配信とは別である。

RubyとJekyll 3.10.0の環境がある場合は、リポジトリのルートをsource、リポジトリ外の空の一時フォルダをdestinationとして、次の形で再確認できる。ビルド用Gemfileやlockfileも一時環境に置く。これは毎回のPlaywright実行に必要な依存ではない。

```sh
# Jekyll 3.10.0を解決した一時GemfileをBUNDLE_GEMFILEで指定した環境で実行
jekyll_output=$(mktemp -d)
bundle exec jekyll build --source . --destination "$jekyll_output" --safe
# 出力が管理文書5件＋index.html＋ogp.pngのみで、_tests/がないことを確認する
```

`check:pages`は`.nojekyll`、公開設定ファイル、プラグイン、workflow、未審査のルートファイル等が追加されると失敗させる保守用ガード。将来Pages方式や`include`設定を変える場合は、除外条件を改めて検証する。ガードだけを削除して通さない。今回は`_config.yml`、公開用workflow、公開元を変更していない。

## 手動で残す確認

- iPhone Safari / Android Chromeのタップ、ソフトウェアキーボード、回転、バックグラウンド復帰・OSによる再読み込み。
- SNSアプリ内ブラウザ、長いURLのコピー・共有経路。300曲のローカル成功だけでSNS上も成功と判断しない。
- 7テーマの実機での判読、長い曲名、読み上げ・キーボード操作・拡大・動きを減らす設定。
- クリップボードのOS許可、実際のSNS遷移やDM送信、公開後のPagesとOGPプレビュー。
- IMP-001は同一イベントでの復元の最低限をテスト化。別イベント・期限・破損・旧形式・保存不可・複数タブは保存設計の合意後に追加する。

## 公式資料

- [Playwright対応環境](https://playwright.dev/docs/intro#system-requirements)
- [headless shellの導入](https://playwright.dev/docs/browsers#chromium-headless-shell)
- [Node.jsのサポート状況](https://nodejs.org/en/about/previous-releases)
- [Node.js 24.22.2公式配布とSHA-256](https://nodejs.org/dist/v24.22.2/SHASUMS256.txt)
- [Jekyllの標準除外規則](https://jekyllrb.com/docs/structure/)
- [GitHub Pages採用バージョン](https://pages.github.com/versions/)
- [Jekyll 3.10.0 EntryFilter](https://github.com/jekyll/jekyll/blob/v3.10.0/lib/jekyll/entry_filter.rb)

公式Node配布のSHA-256（今回のdarwin-x64.tar.gz）：`d5e336d588c45be0c37dbd52cc29895593009ca4997a77a1fd02815131ed0e52`。
