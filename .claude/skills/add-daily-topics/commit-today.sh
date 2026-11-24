#!/usr/bin/env bash
# 今日のネタ（data/topics.json）だけをコミットし、コミットのハッシュを出す。
# 使い方：bash .claude/skills/add-daily-topics/commit-today.sh
#
# 引数も引用符も要らない形にしているのは、定期実行で許可ルールにそのまま当たるようにするため。
# 条件に合わなければ何もコミットせず、理由を出して終了コード 1 で終わる。
set -u

fail() {
  echo "コミットしない：${1}" >&2
  exit 1
}

[ $# -eq 0 ] || fail "引数は要らない"

root=$(git rev-parse --show-toplevel 2>/dev/null) || fail "git のリポジトリの中ではない"
cd "$root" || fail "リポジトリのルートに移れない"

[ "$(git rev-parse --abbrev-ref HEAD)" = "main" ] || fail "今のブランチが main ではない"

staged=$(git diff --cached --name-only)
[ -z "$staged" ] || fail "すでにステージされている変更がある：$(echo $staged)"

[ -n "$(git status --porcelain -- data/topics.json)" ] || fail "data/topics.json に変更がない"

today=$(bash .claude/skills/add-daily-topics/today.sh) || fail "今日の日付を取れない"

git add data/topics.json || fail "data/topics.json をステージできない"
git commit -q -m "今日の雑談ネタを追加 (${today})" -m "Co-Authored-By: Claude <noreply@anthropic.com>" || fail "コミットできない"

echo "コミットした：$(git rev-parse HEAD)"
