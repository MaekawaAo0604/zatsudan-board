# 雑談ボード

今日の雑談ネタを並べて、話したいものを押せるボードです。
ビルド不要の HTML / CSS / JavaScript だけで動きます。

## 手元で動かす

ファイルを直接開くとデータを読めないため、簡易サーバーで開きます。

```bash
python3 -m http.server 8000
```

ブラウザで http://localhost:8000 を開きます。
手元で「話したい」を押すと、公開中のボードと同じ Firebase のデータベースに届きます（データベースは1つだけ）。試したら取り消してください。

## ファイル

| ファイル | 役割 |
|---|---|
| `index.html` | 画面 |
| `style.css` | 見た目 |
| `app.js` | 表示と操作 |
| `board.js` | ランダムに選ぶ・まとめてコピー・「話したい」の数え方の決めごと（テストで確かめている） |
| `tests/` | テスト |
| `store.js` | 保存。毎朝のネタの「話したい」は Firebase で共有、それ以外はブラウザの localStorage |
| `firebase-config.js` | Firebase の設定の値（公開される前提の値） |
| `firestore.rules` | Firestore のルール。Firebase コンソールにも同じ文面を貼る |
| `data/topics.json` | 毎日のネタ |

## 毎日のネタの形式

`data/topics.json` の `days` に、日付ごとに 1 件追加します。

```json
{
  "date": "2026-11-09",
  "topics": [
    { "id": "2026-11-09-1", "title": "ネタのタイトル", "detail": "ひとこと（空でもよい）" }
  ]
}
```

- `date` は `YYYY-MM-DD`。同じ日付は 1 件だけにします。
- `id` は全期間で重複しない `日付-連番` の形にします（例 `2026-11-09-1`）。「話したい」はこの `id` に結び付きます。
  `firestore.rules` がこの形を前提にしているので、ほかの形の `id` のネタは「話したい」を押せません。
- 今日の分があれば今日、なければいちばん新しい日が表示されます。

ネタは Claude Code のスキル `add-daily-topics`（`.claude/skills/add-daily-topics/`）で足せます。
Claude Code で `/add-daily-topics` と入力するか、「今日のネタを足して」と頼みます。
形式のチェックだけなら次を実行します。

```bash
node .claude/skills/add-daily-topics/validate.mjs data/topics.json
```

## テスト

Node だけで動きます（パッケージのインストールは不要）。

```bash
node --test "tests/*.test.mjs"
```

Claude Code でファイルを編集すると、Hooks でこのテストが自動で実行されます（`.claude/settings.json`）。

## 今の制限

- 共有されるのは、毎朝のネタの「話したい」だけです。おすすめとそのコメント、おすすめの「話したい」、「話した」の印は、そのブラウザの中にだけ保存されます。
- 「話したい」は1人1回ですが、ブラウザを替えれば押し直せます。
- Firebase につながらないときは、毎朝のネタの「話したい」が「—」になり、押せません。

## Firebase の設定

Firebase の無料プラン（Spark）で、次を使っています。

- Authentication の匿名ログイン（仲間はアカウントなしで、ブラウザごとに見分けられる）
- Firestore（Standard エディション、場所は `asia-northeast1`）

`firestore.rules` を変えたら、Firebase コンソールの「Firestore Database」→「ルール」にも同じ文面を貼って公開します。
