#!/bin/bash
# Claude がファイルを編集するたびに（PostToolUse: Edit|Write）テストを実行する。
# 失敗したら終了コード 2 で結果を Claude に返し、直させる。
# 設定は .claude/settings.json の hooks にある。

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}" || exit 0

# node が PATH にない環境（nvm で入れた場合など）では nvm を読み込んで探す
if ! command -v node >/dev/null 2>&1 && [ -s "$HOME/.nvm/nvm.sh" ]; then
  . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1
fi
if ! command -v node >/dev/null 2>&1; then
  echo "テストを実行できませんでした：node が見つかりません" >&2
  exit 1 # 編集は止めずに、知らせるだけ
fi

if ! out=$(node --test --test-reporter=spec "tests/*.test.mjs" 2>&1); then
  {
    echo "テストが失敗しました。CLAUDE.md の「画面の機能」の決めごとを破っていないか確かめてください。"
    # 失敗したテストの名前と理由だけを返す（スタックトレースは省く）
    echo "$out" | sed -n '/failing tests:/,$p' | grep -vE '^\s+at |^test at ' | head -40
  } >&2
  exit 2
fi
exit 0
