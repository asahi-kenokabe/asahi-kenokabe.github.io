# CLAUDE.md

## プロジェクトの目的

既存サイト http://lotas-asahi.com を GitHub Pages でホストするための静的サイトを、このリポジトリで管理する。

- 既存サイトの全コンテンツ(ページ・テキスト・画像など)をクローンする。
- 現在ホストしているサービスから離れ、今後はエージェント経由でこのリポジトリの静的サイトを更新していく。
- 旧サービスが作ったデザイン(著作権上の干渉があり得るもの)は、そのまま流用せず、自前のデザインで上書きする。
- ドメイン(lotas-asahi.com)はお名前.comで移管し、後から GitHub Pages の IP に紐づける予定。ドメインは変えずに、既存HPが GitHub Pages 上で公開されることになる。
  - 独自ドメイン運用に備え、公開時はリポジトリのルートに `CNAME` ファイル(`lotas-asahi.com`)を置く。

## Git運用ルール(厳守)

1. **`main` ブランチのみを使う。** `main` 以外のブランチは作成しない、使わない。
   - 作業ブランチ、feature ブランチ、PR 用ブランチも作らない。
2. **作業成果は、すべて即座に commit / push して同期する。**
   - ファイルを作成・変更したら、区切りごとに待たずに `main` へ commit し、`git push origin main` する。
   - 未 push の変更を残したままにしない。
3. 他の環境からの更新と衝突しないよう、作業前に `git pull origin main` で最新を取り込む。

## 作業品質ルール

- すべてのフェーズで、結果が正しく完全であることをダブルチェックしてから次に進む。取りこぼし、欠落、偽の成功(HTTP 200 で HTML のエラーページが返る等)を放置しない。
- 検証した内容と結果(未解決の項目を含む)は、該当するドキュメントに記録する。
- **見た目(HTML・CSS・レイアウト)を変更したら、完了の報告の前に、必ず `npm run build && npm run check:layout` を実行し、問題0件にする。** 全ページを、複数の画面幅(320〜1280px)と文字拡大(1.3倍)で自動検査し、電話番号の折り返し、1文字だけの行、横はみ出し、コントラスト不足、壊れた画像を検出する。検査が通ったあとで、主要ページを目視でも確認する。ユーザーに、崩れを指摘させない。

## 開発コマンド

- `npm run build`: ビルド(`dist/` に出力)。ビルド後に、日本語の文節の境目へ `<wbr>` を入れる処理(`tools/phrase-breaks.py`)が自動で動く。事前に `pip install budoux beautifulsoup4` が必要。`npm run dev`: 開発サーバー(`<wbr>` は入らない)。
- 元サイトの本文を再抽出する場合: `python3 -I tools/extract.py`(`backup/original` が入力)。検証は `npm run build` 後に `python3 -I tools/verify.py`。
- レイアウトの自動検査: `npm run build` 後に `npm run check:layout`(`tools/layout-check.cjs`、Playwright が必要)。
- 生成物の詳細・検証結果・未対応事項は `extraction-report.md` を参照。
