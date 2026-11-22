#!/usr/bin/env bash
# クラウドで動くときだけ、ネタを書き換える前に最新の main に移る。
# 使い方：bash .claude/skills/add-daily-topics/prepare-main.sh
#
# クラウド（CLAUDE_CODE_REMOTE が true）でなければ、git に一切触らずに終了コード 0 で終わる。
# 移るのは claude/ ではじまるブランチからだけ。そのブランチのコミットは main に持ち込まない。
# 条件に合わなければ理由を出して終了コード 1 で終わる。reset、rebase、強制の切り替えはしない。
set -u

fail() {
  echo "main に移らない：${1}" >&2
  exit 1
}

# ブランチを移るとこのファイル自体も入れ替わるので、全体を関数に入れて読み切ってから実行する。
main() {
  if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
    echo "クラウドではないので、ブランチはそのままにする"
    return 0
  fi

  [ $# -eq 0 ] || fail "引数は要らない"

  local root branch ahead
  root=$(git rev-parse --show-toplevel 2>/dev/null) || fail "git のリポジトリの中ではない"
  cd "$root" || fail "リポジトリのルートに移れない"

  branch=$(git rev-parse --abbrev-ref HEAD)
  case "$branch" in
    main | claude/*) ;;
    *) fail "main でも claude/ ではじまるブランチでもない（${branch}）" ;;
  esac

  [ -z "$(git status --porcelain --untracked-files=no)" ] || fail "コミットしていない変更がある"

  # main を含まない取り方の複製でも origin/main ができるよう、取得先を明示する。
  git fetch -q origin refs/heads/main:refs/remotes/origin/main || fail "origin から main を取得できない"

  if git show-ref --verify --quiet refs/heads/main; then
    ahead=$(git rev-list --count origin/main..main) || fail "main と origin/main を比べられない"
    [ "$ahead" = "0" ] || fail "main に未プッシュのコミットが ${ahead} 件ある"
    git switch -q main || fail "main に切り替えられない"
    git merge -q --ff-only origin/main || fail "main を origin/main まで進められない"
  else
    git switch -q --no-track -c main origin/main || fail "main を作れない"
  fi

  # 手元の .git/config はクラウドに届かないので、CLAUDE.md の「公開」の決まりどおりの作者アドレスをここで設定する。
  git config user.email "170487248+MaekawaAo0604@users.noreply.github.com" || fail "作者アドレスを設定できない"
  # 環境変数の指定は git config より優先されるので、実際に使われるアドレスを確かめる。
  case "$(git var GIT_AUTHOR_IDENT)" in
    *"@users.noreply.github.com>"*) ;;
    *) fail "作者アドレスが GitHub の非公開用アドレスにならない" ;;
  esac
  case "$(git var GIT_COMMITTER_IDENT)" in
    *"@users.noreply.github.com>"*) ;;
    *) fail "コミッターのアドレスが GitHub の非公開用アドレスにならない" ;;
  esac

  echo "最新の main で作業する：$(git rev-parse --short HEAD)（元のブランチ：${branch}）"
}

main "$@"; exit
