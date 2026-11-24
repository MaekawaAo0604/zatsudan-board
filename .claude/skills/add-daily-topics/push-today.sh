#!/usr/bin/env bash
# 今日のネタのコミットを origin/main にプッシュする。
# 使い方：bash .claude/skills/add-daily-topics/push-today.sh <この実行で作ったコミットのハッシュ>
#
# origin/main より先にあるのが、渡したコミット（今日のネタ、data/topics.json だけの変更）1件だけのときに限ってプッシュする。
# 1つでも条件に合わなければ、何もせずに理由を出して終了コード 1 で終わる。強制プッシュはしない。
set -u

fail() {
  echo "プッシュしない：${1}" >&2
  exit 1
}

[ $# -eq 1 ] || fail "この実行で作ったコミットのハッシュを1つ渡してください"

root=$(git rev-parse --show-toplevel 2>/dev/null) || fail "git のリポジトリの中ではない"
cd "$root" || fail "リポジトリのルートに移れない"

[ "$(git rev-parse --abbrev-ref HEAD)" = "main" ] || fail "今のブランチが main ではない"

want=$(git rev-parse --verify -q "$1^{commit}") || fail "コミット $1 が見つからない"
head=$(git rev-parse HEAD)
[ "$head" = "$want" ] || fail "いちばん新しいコミットが、渡したコミットではない"

today=$(bash .claude/skills/add-daily-topics/today.sh) || fail "今日の日付を取れない"
subject=$(git log -1 --format=%s HEAD)
[ "$subject" = "今日の雑談ネタを追加 ($today)" ] || fail "今日のネタのコミットではない（件名：${subject}）"

files=$(git diff-tree --no-commit-id --name-only -r HEAD)
[ "$files" = "data/topics.json" ] || fail "data/topics.json 以外も変わっている：$(echo $files)"

git fetch -q origin main || fail "origin から main を取得できない"

counts=$(git rev-list --left-right --count origin/main...HEAD) || fail "origin/main と比べられない"
read -r behind ahead <<<"$counts"
[ "$behind" = "0" ] || fail "origin/main に手元にないコミットが $behind 件ある"
[ "$ahead" = "1" ] || fail "origin/main より先にあるコミットが $ahead 件ある（1件のときだけプッシュする）"

git push origin HEAD:main || fail "プッシュが受け付けられなかった"

echo "プッシュした：$(git rev-parse --short HEAD) $subject"
