// CLAUDE.md「画面の機能」のうち、おすすめへのコメントの保存を確かめる。
// 実行：node --test "tests/*.test.mjs"
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as store from "../store.js";

const date = "2026-11-22";

// Node には localStorage がないので、同じ形の代わりを毎回まっさらにして置く
beforeEach(() => {
  const data = new Map();
  const fake = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
  };
  Object.defineProperty(globalThis, "localStorage", { value: fake, configurable: true });
});

const add = (title) => store.addSuggestion(date, { title, detail: "ひとこと", author: "" });

test("コメント：書き足した順に保存され、ひとことは変わらない", async () => {
  const item = await add("おすすめ");
  await store.addComment(date, item.id, "1つ目");
  await store.addComment(date, item.id, "2つ目");
  const [saved] = await store.getSuggestions(date);
  assert.deepEqual(saved.comments.map((c) => c.text), ["1つ目", "2つ目"]);
  assert.equal(saved.detail, "ひとこと");
});

test("コメント：指定した1件だけを削除する", async () => {
  const item = await add("おすすめ");
  const [first] = await store.addComment(date, item.id, "消す");
  await store.addComment(date, item.id, "残す");
  await store.removeComment(date, item.id, first.id);
  const [saved] = await store.getSuggestions(date);
  assert.deepEqual(saved.comments.map((c) => c.text), ["残す"]);
});

test("コメント：comments のない古いおすすめにも書き足せる", async () => {
  const old = [{ id: "s-old", title: "前に足したもの", detail: "", author: "" }];
  localStorage.setItem(`zatsudan-board:suggestions:${date}`, JSON.stringify(old));
  await store.addComment(date, "s-old", "あとから");
  const [saved] = await store.getSuggestions(date);
  assert.equal(saved.title, "前に足したもの");
  assert.equal(saved.comments[0].text, "あとから");
});

test("コメント：ほかのおすすめや、ほかの日には影響しない", async () => {
  const target = await add("書き足すほう");
  const other = await add("そのまま");
  await store.addComment(date, target.id, "こちらだけ");
  assert.deepEqual((await store.getSuggestions(date))[1], other);
  assert.deepEqual(await store.getSuggestions("2026-11-21"), []);
});

test("コメント：削除済みのおすすめには書き足さない", async () => {
  const item = await add("消えるもの");
  await store.removeSuggestion(date, item.id);
  assert.equal(await store.addComment(date, item.id, "届かない"), null);
  assert.deepEqual(await store.getSuggestions(date), []);
});
