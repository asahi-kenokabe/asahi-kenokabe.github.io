# TODO

最終更新: 2026-11-02

## 要判断・要作業(担当: 未着手)

M. **リポジトリ移行(コード側は完了・旧リポジトリ削除待ち)**: `ken-okabe` アカウントでは干渉が発生するため、`asahi-kenokabe` アカウントで行う。さらにルートURL(`https://asahi-kenokabe.github.io/`)で公開するため、`asahi-kenokabe/asahi-kenokabe.github.io`(ユーザーサイト)に移した。
   - 経緯: `ken-okabe/asahi-hp` → `asahi-kenokabe/asahi-hp`(プロジェクトサイト、`/asahi-hp/` 配下)で公開確認(到達ページ64、画像・CSS等258URLがすべて HTTP 200、不達0、`dekiteru` 参照0。Pages の Source は「GitHub Actions」にする必要があった)→ 全履歴を `asahi-kenokabe/asahi-kenokabe.github.io` の `main` に移行。
   - 検証(2026-11-02、`https://asahi-kenokabe.github.io/` をトップからクロール): 到達ページ64、画像・CSS等258URLがすべて HTTP 200 かつ HTML エラーページではない。不達0、`dekiteru` 参照0、`/asahi-hp` 付きリンク0。Pages の Source は「GitHub Actions」に設定済み(未設定の間は Jekyll の自動ビルドが失敗する)。
   - 本リポジトリでは、仮URL用ベースパス処理(`deploy.yml` の `prefix-base.mjs` ステップ)を撤去した(ルート配信のため)。`tools/prefix-base.mjs` は無害なので残す。
   - 残り(ユーザー実施。エージェントは実行しない): ルート公開を目視確認した後、`asahi-kenokabe/asahi-hp` と `ken-okabe/asahi-hp` を削除する。
   - 独自ドメイン接続時: `CNAME` の追加のみ(ベースパス処理は撤去済み)。

1. **Googleフォームの作成**: 「お問合せ」「お見積り」の2種類。作成後、埋め込みURLを `src/components/ContactForm.astro` の `formUrl` に設定する(現在は電話案内を表示)。お見積り用ページ(`estimate.html` は元サイトで404のため、新規作成するか要判断)。
2. **ヘッダー画像の差し替え**: `public/images/header.png.webp` は旧サービスのテンプレート由来(木目調の背景)。自前のロゴ・ヘッダーに差し替える。
3. **画像の権利確認**: 本文画像(`public/images/`)が自社撮影か、ストック素材かを確認する。
4. **未決定事項**:
   - Google Analytics (`G-GW41Y7S1DE`) を継続するか(現在は未導入)
   - トップの「お盆休み」告知(`src/data/site.json` の `notice`)を残すか
   - 外部リンク(lotas.co.jp、carbell.jp 等)の維持
   - `CNAME` を `www.lotas-asahi.com` と apex のどちらにするか(元サイトの正規URLは `www` 付き)

## 完了した作業の記録

- 仮URL対応(案A、現在は撤去済み)。ビルド後に `tools/prefix-base.mjs` で `/` 始まりのリンク・画像へ `BASE_PATH` を付与。ローカルで `/asahi-hp/` 配下に配置し、67ページ・内部リンク4,288件が全て到達できることを確認(2026-11-02)。

- 元サイトのバックアップ(`backup/`)、本文抽出、Astro土台、GitHub Actions ワークフロー: `extraction-report.md` 参照
- GitHub Pages の有効化(Source: GitHub Actions): ユーザー実施済み
