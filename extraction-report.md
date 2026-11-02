# コンテンツ抽出・Astro土台の記録(2026-11-02)

## 構成

- `tools/extract.py`: `backup/original/pages` から本文を抽出し、`src/pages/*.astro`、`src/data/{nav,pages}.json`、`public/images/` を生成する(再実行可能)。実行ログは `tools/extract-report.json`。
- `tools/verify.py`: `npm run build` 後に、元ページと `dist/` を本文テキスト・画像・リンクで突き合わせる。
- `src/layouts/Layout.astro`: 共通レイアウト(ヘッダー、メニュー、パンくず、相談CTA、同カテゴリの他ページ一覧、サイドバー、フッター)
- `src/styles/global.css`: 自前のCSS(旧サービスのCSS・テンプレート画像は使用していない)
- `src/data/site.json`: 店舗情報(電話、住所、営業時間、定休日、お知らせ)
- `src/components/ContactForm.astro`: フォーム(Googleフォームの埋め込みURL未設定のため、現在は電話案内を表示)
- `.github/workflows/deploy.yml`: `main` への push で Astro をビルドし GitHub Pages にデプロイ

## 生成結果

- 元の73 URLのうち、67ページを生成(`index.html` と `/` は同一内容を確認済み)。
- 生成しなかったもの: `thankyou` 系5ページ(Googleフォーム採用のため不要)。`404.html` は `src/pages/404.astro` として新規作成。
- URLは元サイトと同じ形式(`/shaken_29.html` など)で維持。

## 検証結果

- 66ページ(index・contact含む)で、本文テキスト・画像ファイル名・リンク先が元ページと完全一致(`tools/verify.py`、不一致0)。比較から除いたもの: パンくず、相談CTA(70ページ同一内容を共通部品化)、「他のページ」一覧(メニューデータから自動生成)、フォーム部品。
- 同カテゴリの子ページ数が元メニューと一致: 車検10、板金塗装7、新車・中古車販売18、その他25(各トップ含む)。
- 内部リンクのリンク切れ0。生成HTMLに `dekiteru` への参照0。
- PC・スマホ幅で主要ページ(トップ、車検、アクセス、お問合せ)を画面で確認。

## 元サイト由来の事実・注意点

- 本文が空のページが元サイトにもある: `shaken_65`(車検 料金表)、`other_3`。
- `estimate.html`(お見積り)は元サイトで404(メニューやリンクにだけ残っていた)。メニューからは除外し、本文内リンクは `/contact.html` に付け替えた(付け替え一覧は `tools/extract-report.json`)。
- 本文中の `thankyou` 系へのリンクも `/contact.html` に付け替えた。
- Googleマップは、APIキーが埋まった埋め込みをキー不要の埋め込みに差し替えた。
- 本文の文字装飾は、赤字・黄色マーカー・太字のみ意味を保って再現(`t-red` / `t-mark` / `t-bold`)。文字サイズ等のインライン指定は破棄。
- 本文はHTMLのまま `.astro` に入っている(構造を保つため)。見出し・段落・画像・表の標準タグのみ。

## 未対応・要判断

- Googleフォームの作成と `ContactForm.astro` への埋め込みURL設定(お問合せ・お見積り)。
- ヘッダー画像 `public/images/header.png.webp` は旧サービスのテンプレートで作られた画像(木目調の背景、会社名と電話番号入り)。自前のロゴへの差し替えを推奨。
- 本文画像の権利確認(自社撮影か)。
- Google Analytics は未導入(継続可否が未決定)。
- 「お盆休みのお知らせ」(`site.json` の `notice`)は元サイトのトップにある時季ものの告知。表示継続の要否を確認。
- GitHub Pages の有効化(Settings → Pages → Source: GitHub Actions)と、`CNAME` の設定(`www` 付きか apex か未決定)。
- 各ページ個別の見出し・本文の文字サイズ、トップページの意匠など、デザインの作り込みはこれから。

## 仮URL(github.io/asahi-hp/)対応(`asahi-kenokabe.github.io` への移行で、デプロイ時の適用は撤去済み)

- 本文・レイアウトのリンクと画像は `/` 始まりの絶対パスのため、プロジェクトパス配信では壊れる。`tools/prefix-base.mjs` がビルド後に `BASE_PATH` を付与する(冪等)。ワークフローで `BASE_PATH=/asahi-hp` を指定。
- 独自ドメイン接続時はワークフローの該当ステップを削除する(`TODO.md` 項目0)。
