# QA Report — NEON TICKET MVP

- 実施日：2026-10-14
- 結果：プレビュー63 passed / 0 failed、未接続配布モード10 passed、SQL22 passed
- Node.js：v24.19.0
- Google Chrome：153.0.8010.52
- テスト方式：Chrome DevTools Protocolによる実ブラウザ操作
- 対象：`dist/index.html`、`dist/styles.css`、`dist/app.js`、`dist/assets/*.png`

## 検証範囲

- 初期状態、ページタイトル、残高、景品数、3ガチャの口数
- ガチャごとのレア度付き景品ラインナップとラストワン条件
- デイリー、広告視聴、アンケート、アプリ条件のチケット付与
- 同一ミッションの重複付与防止と共通チケット台帳
- 1回、10回、100回抽選の残高・口数・景品・履歴の整合性
- 抽選結果が演出前に確定されること
- 100回結果の要約表示と全件展開
- 抽選実行ボタン連打時の二重消費防止
- チケット不足と口数不足のガード
- ラストワン賞の一度だけの付与、完売後の抽選停止
- 発送申請、チケット交換、景品ステータス、管理画面への反映
- 管理者によるチケット付与、ガチャ停止、発送済み更新
- ガイド進捗、状態リセット、再読み込み後の保存
- 375px、768px、900px、1440pxでの横あふれとナビゲーション切替
- ブラウザのコンソールエラー、未処理例外、主要アセットのHTTPエラー
- オリジナルキャラクター画像のHTTP読み込みとPC／モバイル表示
- 鳳凰・海龍の抽選、5種類のFV選択、月・太陽・海背景切り替え
- 配布モードの未接続時ガード、偽のlocalStorage残高無視、管理画面非表示
- PGliteでSQLコンパイル・RPC権限・会員分離・二重取引・ラストワン・管理付与を確認

## 再実行

ターミナル1：

```bash
python3 -m http.server 4173 --directory dist
```

ターミナル2（Linux / Google Chrome）：

```bash
google-chrome --headless=new --no-sandbox \
  --remote-debugging-port=9223 \
  --user-data-dir=/tmp/neon-ticket-qa about:blank
```

ターミナル3：

```bash
node tests/smoke.mjs
```

スクリーンショットの再生成：

```bash
node tests/capture.mjs
```

環境を変える場合は `BASE_URL` と `CDP_HOST` を指定できます。

## 検証上の前提

抽選内容はランダムなため、個別のレア度件数ではなく、消費チケット、残り口数、獲得総数、履歴、ラストワン条件を検証しています。`prefers-reduced-motion: reduce` をエミュレートし、抽選結果を変えずに演出待ち時間だけ短縮しています。

この検証はフロントエンドMVPの品質確認です。本番で必要なサーバー側トランザクション、認証、外部広告成果通知、実配送連携、負荷・侵入・法務テストは対象外です。

今回追加したSQLはPGlite上で処理と権限を検証しています。テスト内のAuthと乱数は代替関数で、本物のSupabase Auth・pgcrypto・同時接続は未検証です。実際のGoogle認証、メール確認、SMTP、本番DB、外部広告、配送はまだ接続されていません。完全稼働の配布版としての検証完了を意味しません。
