# FORMULA — ローカル試作

数学公式を保存・整理し、カードで復習するためのレスポンシブWebサイトです。

## ローカルで開く

画面だけを見る場合は `index.html` をブラウザで開けます。Supabase AuthとDatabaseを使うときは、`file://`ではなくローカルWebサーバー経由で開いてください（VS CodeのLive Serverなど）。LaTeX表示とSupabase接続にはインターネット接続が必要です。

## Supabase接続

1. `supabase-config.js` にProject URLとPublishable keyを設定します。
2. `public.formulas` テーブルが未作成の場合だけ、`S5-公式テーブル設定.sql` をSupabase SQL Editorで一度実行します。テーブルが既にある場合は再実行しません（`relation "formulas" already exists` は作成済みを示します）。
3. SupabaseのメールAuthユーザーでログインします。

この画面には新規登録機能を置いていません。ブラウザに設定するのは公開用のPublishable keyだけです。`service_role`やSecret keyは置かないでください。

## 現在の機能

- Supabaseメール／パスワードログイン、ログアウト、ログイン状態の復元
- Supabaseから公式を取得し、追加・編集・削除
- 公式名・内容の検索、タグによる絞り込み
- KaTeX数式プレビュー、公式詳細・単語帳の数式表示（公式内容欄はLaTeXのみ。通常文は説明欄）
- 入力途中の公式をブラウザ内に自動保存し、戻ったときに復元
- PC／スマートフォン向けレイアウト

以前の試作データがブラウザの`localStorage`にあっても、削除せずそのまま残しています。S5ではSupabaseの公式データだけを表示・更新します。以前のデータをSupabaseに移す場合は、重複を避けるため別途取り込みを行います。

## GitHub Pagesで公開

公開手順とSupabase AuthのURL設定は [S7-GitHub公開手順.md](S7-GitHub公開手順.md) を参照してください。
