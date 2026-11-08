# 雑談ボード

今日の雑談ネタを並べて、話したいものを押せるボードです。
ビルド不要の HTML / CSS / JavaScript だけで動きます。

## 手元で動かす

ファイルを直接開くとデータを読めないため、簡易サーバーで開きます。

```bash
python3 -m http.server 8000
```

ブラウザで http://localhost:8000 を開きます。

## ファイル

| ファイル | 役割 |
|---|---|
| `index.html` | 画面 |
| `style.css` | 見た目 |
| `app.js` | 表示と操作 |
| `store.js` | 押した数とおすすめの保存（今はブラウザの localStorage） |
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
- `id` は全期間で重複しない文字列にします（`日付-連番` を推奨）。押した数はこの `id` に結び付きます。
- 今日の分があれば今日、なければいちばん新しい日が表示されます。

ネタは Claude Code のスキル `add-daily-topics`（`.claude/skills/add-daily-topics/`）で足せます。
Claude Code で `/add-daily-topics` と入力するか、「今日のネタを足して」と頼みます。
形式のチェックだけなら次を実行します。

```bash
node .claude/skills/add-daily-topics/validate.mjs data/topics.json
```

## 今の制限

- 押した数とメンバーのおすすめは、そのブラウザの中にだけ保存されます（ほかの人とは共有されません）。
  共有するときは `store.js` の関数の中身を差し替えます。
