#!/usr/bin/env bash
# 今日の日付を、日本の日付（YYYY-MM-DD）で出す。
# 使い方：bash .claude/skills/add-daily-topics/today.sh
#
# クラウドの時計は UTC なので、date +%F だと日本の朝9時より前は前の日になる（2026-11-23 と 11-24 の朝にずれた）。
# タイムゾーンのデータがない環境でも効くよう、Asia/Tokyo ではなく JST-9 で指定する（日本は夏時間がない）。
# commit-today.sh と push-today.sh も、日付はここから取る。
set -u

[ $# -eq 0 ] || { echo "引数は要らない" >&2; exit 1; }

TZ=JST-9 date +%F
