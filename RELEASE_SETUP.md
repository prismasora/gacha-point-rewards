# 配布版の接続手順と現在の状態

配布用ソースを実装していますが、Supabaseプロジェクト未作成のため、本番認証・DBはまだ接続されていません。初期ルートは配布モードで、未接続時は会員登録・抽選を成功扱いにしません。

## 用意した機能

- メール登録・確認メール、メール／Googleログイン、ログアウト、パスワード再設定画面。
- 会員別のチケット・景品・台帳・抽選履歴・交換申請。
- サーバー側抽選、会員と在庫の行ロック、取引IDによる二重消費防止。
- デイリー報酬、アンケート報酬の重複防止。
- 発送申請、景品のチケット交換、発送ステータス。
- 管理者による対象会員への付与、ガチャ公開停止、発送管理、全会員の履歴と操作ログ。
- ローカルプレビューは `/?preview=1`。本番データへの操作には使われません。

## 1. Supabaseプロジェクトを作成

Supabaseでプロジェクトを作成し、Project URLとanon keyまたはpublishable keyを確認します。
`dist/config.js` の `supabaseUrl` と `supabaseKey` に公開値だけを設定してください。`service_role`、secret key、DBパスワードはブラウザコードへ入れません。

SQL EditorまたはSupabase CLIで `supabase/migrations/202610140001_core.sql` を一度適用します。このファイルは新規DB向けです。既存テーブルがあるDBへはそのまま実行しないでください。

DBは直接書き込み権限を開放せず、認証済みユーザーのRPCだけを許可します。RPCは `auth.uid()` から会員を特定します。管理者は別テーブルで管理し、ユーザー自身のメタデータで昇格できません。

## 2. 認証を設定

- AuthenticationのSite URLに実際の公開URLを登録します。
- Redirect URLsに同じサイトのルートURLと、必要なローカル検証URLを登録します。
- Email確認を有効化し、配信用SMTPを設定します。
- Googleプロバイダーを有効化し、Google Cloudで発行したOAuth情報をSupabase側に登録します。秘密情報を `config.js` に書きません。
- Google Cloudの承認済みリダイレクトURIはSupabaseに表示されるコールバックURLを使用します。
- サイト側のホスティングアクセスも一般利用者が閲覧できる設定が必要です。現在のSitesは所有者限定を維持しています。

参考：[Google認証](https://supabase.com/docs/guides/auth/social-login/auth-google)、[パスワード再設定](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail)、[DB関数](https://supabase.com/docs/guides/database/functions)。

## 3. 管理者と実在庫を設定

登録した管理者のAuth UUIDを確認し、SQL Editorで以下を実行します。UUIDは実際の値に置き換えます。

```sql
insert into public.nt_admins(id) values ('管理者のAuth UUID');
```

初期ガチャはすべて停止中です。景品ID、実際の景品、提供条件、配送可能範囲、口数を確認してから、DB内の `nt_campaigns` を更新し、管理画面から公開してください。現状のカタログと交換換算値は企画用の値です。実物フィギュア・ぬいぐるみの製造／在庫を用意する実装は含まれません。

管理画面のチケット付与には対象会員のUUIDを入力します。発送申請の配送先は管理者だけが確認できます。発送済み更新は受付管理であり、配送業者への出荷指示や追跡番号連携はまだありません。

## 未接続の機能

広告・アプリ成果は提供会社が未指定なので、配布モードでは「準備中」です。視聴タイマーや自己申告で本番チケットを付与しません。提供会社の署名付き成果通知、重複通知の識別、会員への照合を追加する必要があります。

規約・FAQ・通知設定など旧プレビューの一部導線は接続が残っています。実際の運営者情報、問い合わせ先、配送条件、プライバシーポリシーも確定していません。「全機能が稼働する本番完成版」とはまだ扱えません。

## 検証

- `node tests/smoke.mjs`：ローカルプレビューの抽選・交換・5種類の演出・画面幅。
- `node tests/release.mjs`：設定前の配布モードが偽ログインや偽チケット付与をしないこと。
- `node tests/database.mjs`：PGlite上でSQLをコンパイルし、権限・二重処理・会員分離を確認。

SQLテストはAuthと乱数関数をテスト用に置き換えています。Supabaseの実認証、Google、確認メール、SMTP、pgcrypto乱数、実DBでの同時抽選は、接続後の検証が必要です。PGliteは `/tmp/neon-ticket-db-qa` へ一時インストールしています。別PCでは `PGLITE_MODULE` にインストール済みモジュールの絶対パスを指定してください。

接続後は2会員と管理者で認証・データ分離・並列抽選・二重交換・ログアウト・復旧の実機検証を行ってから受付を開始してください。
