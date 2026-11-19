// CLAUDE.md「画面の機能」の決めごとが、あとの修正で元に戻っていないかを確かめる。
// 実行：node --test "tests/*.test.mjs"
// Claude Code がファイルを編集するたびに、.claude/hooks/run-tests.sh からも実行される。
import { test } from "node:test";
import assert from "node:assert/strict";
import { pickTopic, buildCopyText } from "../board.js";

const day = {
  date: "2026-11-19",
  topics: [
    { id: "2026-11-19-1", title: "冬に食べたいもの", detail: "鍋派？" },
    { id: "2026-11-19-2", title: "最近の寝る前の過ごし方", detail: "" },
    { id: "2026-11-19-3", title: "行ってみたい場所", detail: "近場でも" },
  ],
};
const suggestions = [
  { id: "s-abc-1", title: "おすすめのネタ", detail: "みんなが足した分", author: "だれか" },
  { id: "s-abc-2", title: "もうひとつのおすすめ", detail: "", author: "" },
];
const dailyIds = day.topics.map((t) => t.id);
const suggestionIds = suggestions.map((s) => s.id);

// random() が 0〜1 のどこを返しても決めごとが守られるかを見る
const randoms = [0, 0.2, 0.4, 0.6, 0.8, 0.9999];

// --- ランダムに選ぶのは、まだ話していない「今日のネタ」だけ ---

test("ランダムに選ぶ：おすすめは選ばない", () => {
  for (const r of randoms) {
    const picked = pickTopic({ day, suggestions }, () => r);
    assert.ok(picked, "今日のネタが残っているのに何も選ばれなかった");
    assert.ok(dailyIds.includes(picked.id), `今日のネタ以外が選ばれた：${picked.id}`);
    assert.ok(!suggestionIds.includes(picked.id), `おすすめが選ばれた：${picked.id}`);
  }
});

test("ランダムに選ぶ：話したネタは選ばない", () => {
  const doneIds = ["2026-11-19-1", "2026-11-19-3"];
  for (const r of randoms) {
    const picked = pickTopic({ day, suggestions, doneIds }, () => r);
    assert.equal(picked?.id, "2026-11-19-2");
  }
});

test("ランダムに選ぶ：今日のネタをぜんぶ話したら、おすすめが残っていても何も選ばない", () => {
  const picked = pickTopic({ day, suggestions, doneIds: dailyIds }, () => 0.5);
  assert.equal(picked, null);
});

test("ランダムに選ぶ：2件以上残っていれば直前と同じネタは避ける", () => {
  for (const r of randoms) {
    const picked = pickTopic({ day, suggestions, previousId: "2026-11-19-2" }, () => r);
    assert.notEqual(picked.id, "2026-11-19-2");
  }
});

// --- まとめてコピーは「今日のネタ」だけ ---

test("まとめてコピー：今日のネタだけが入り、おすすめは入らない", () => {
  const text = buildCopyText({ date: day.date, day, suggestions, doneIds: [] });
  for (const t of day.topics) assert.ok(text.includes(t.title), `今日のネタが抜けている：${t.title}`);
  for (const s of suggestions) assert.ok(!text.includes(s.title), `おすすめが入っている：${s.title}`);
});

test("まとめてコピー：文字だけの箇条書きになる", () => {
  const text = buildCopyText({ date: day.date, day, suggestions, doneIds: ["2026-11-19-2"] });
  assert.equal(
    text,
    [
      "2026年11月19日（木）の雑談ネタ",
      "・冬に食べたいもの（鍋派？）",
      "・最近の寝る前の過ごし方 ✓話した",
      "・行ってみたい場所（近場でも）",
    ].join("\n"),
  );
});
