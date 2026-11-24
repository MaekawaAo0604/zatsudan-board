// 毎朝のネタの「話したい」を共有する仕組みを、Firebase の代わりの偽物で確かめる。
// CLAUDE.md の「画面の機能」：1人1回、数を落とさない、つながらないときは数を出さない。
// 実行：node --test "tests/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import { tallyVotes, voteDocId } from "../board.js";
import { configureSharedVotesForTest, watchDailyVotes, setDailyVote } from "../store.js";

const date = "2026-11-24";
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Firebase の代わり。届いた印を手で流し込める
function fakeBackend(uid = "me") {
  const backend = {
    uid,
    listeners: [],
    unsubscribed: 0,
    sent: [],
    watchVotes(watchDate, onVotes, onError) {
      backend.listeners.push({ watchDate, onVotes, onError });
      return () => { backend.unsubscribed++; };
    },
    addVote: async (d, topicId) => { backend.sent.push(["add", d, topicId]); },
    removeVote: async (topicId) => { backend.sent.push(["remove", topicId]); },
    push(votes, fromServer = true) { for (const l of backend.listeners) l.onVotes(votes, fromServer); },
  };
  return backend;
}

function use(backend, timeoutMs = 60) {
  configureSharedVotesForTest({ load: async () => backend, timeoutMs });
}

function record(states) {
  return (state) => states.push(state.status);
}

// --- 数え方 ---

test("数え方：合計はみんなの分、押したかどうかは自分の分だけ", () => {
  const votes = [
    { date, topicId: `${date}-1`, uid: "me" },
    { date, topicId: `${date}-1`, uid: "a" },
    { date, topicId: `${date}-2`, uid: "a" },
  ];
  const { counts, mine } = tallyVotes(votes, "me");
  assert.deepEqual(counts, { [`${date}-1`]: 2, [`${date}-2`]: 1 });
  assert.deepEqual([...mine], [`${date}-1`]);
});

test("数え方：印の名前はネタとその人で決まる（1人1つのネタに1つだけ）", () => {
  assert.equal(voteDocId(`${date}-3`, "uid123"), `${date}-3_uid123`);
});

// --- 受け取り方 ---

test("受け取り：サーバーで確かめた数が届いたら ready になる", async () => {
  const backend = fakeBackend();
  use(backend);
  const states = [];
  let last;
  const stop = watchDailyVotes(date, (s) => { states.push(s.status); last = s; });
  await wait(5);
  assert.equal(backend.listeners[0].watchDate, date);
  backend.push([{ date, topicId: `${date}-1`, uid: "me" }]);
  assert.deepEqual(states, ["loading", "ready"]);
  assert.equal(last.counts[`${date}-1`], 1);
  assert.ok(last.mine.has(`${date}-1`));
  stop();
});

test("受け取り：一度もつながらないうちの手元の数は使わず、待っても来なければ unavailable", async () => {
  const backend = fakeBackend();
  use(backend, 40);
  const states = [];
  const stop = watchDailyVotes(date, record(states));
  await wait(5);
  backend.push([], false); // オフラインで、手元に何もないときの空の一覧
  assert.deepEqual(states, ["loading"], "手元の空の一覧を 0 件として出してしまった");
  await wait(60);
  assert.deepEqual(states, ["loading", "unavailable"]);
  backend.push([]); // あとからつながったら数を出す
  assert.deepEqual(states, ["loading", "unavailable", "ready"]);
  stop();
});

test("受け取り：つながったあとに切れたら unavailable", async () => {
  const backend = fakeBackend();
  use(backend);
  const states = [];
  const stop = watchDailyVotes(date, record(states));
  await wait(5);
  backend.push([]);
  backend.push([], false);
  assert.deepEqual(states, ["loading", "ready", "unavailable"]);
  stop();
});

test("受け取り：受け取りでエラーが出たら unavailable", async () => {
  const backend = fakeBackend();
  use(backend);
  const states = [];
  const stop = watchDailyVotes(date, record(states));
  await wait(5);
  backend.listeners[0].onError(new Error("permission-denied"));
  assert.deepEqual(states, ["loading", "unavailable"]);
  stop();
});

test("受け取り：Firebase を読み込めなければ unavailable、次に使うときは読み込みをやり直す", async () => {
  let calls = 0;
  configureSharedVotesForTest({ load: async () => { calls++; throw new Error("読み込めない"); }, timeoutMs: 60 });
  const states = [];
  const stop = watchDailyVotes(date, record(states));
  await wait(5);
  assert.deepEqual(states, ["loading", "unavailable"]);
  stop();
  watchDailyVotes(date, () => {})();
  await wait(5);
  assert.equal(calls, 2);
});

test("受け取り：Firebase の読み込みが終わらなければ、待つ時間を過ぎて unavailable", async () => {
  configureSharedVotesForTest({ load: () => new Promise(() => {}), timeoutMs: 30 });
  const states = [];
  const stop = watchDailyVotes(date, record(states));
  await wait(60);
  assert.deepEqual(states, ["loading", "unavailable"]);
  stop();
});

test("受け取り：止めたあとは何も知らせず、受け取りも止める（日付を移ったとき）", async () => {
  const backend = fakeBackend();
  use(backend, 30);
  const states = [];
  const stop = watchDailyVotes(date, record(states));
  await wait(5);
  stop();
  backend.push([{ date, topicId: `${date}-1`, uid: "a" }]);
  await wait(50);
  assert.deepEqual(states, ["loading"]);
  assert.equal(backend.unsubscribed, 1);
});

test("受け取り：読み込み中に止めたら、受け取りを始めない", async () => {
  const backend = fakeBackend();
  let release;
  configureSharedVotesForTest({ load: () => new Promise((r) => { release = () => r(backend); }), timeoutMs: 100 });
  const stop = watchDailyVotes(date, () => {});
  await wait(1); // 読み込みが始まるのを待つ
  stop();
  release();
  await wait(5);
  assert.equal(backend.listeners.length, 0);
});

// --- 押し方 ---

test("押す：付けるときは自分の印を作り、取り消すときは自分の印を消す", async () => {
  const backend = fakeBackend();
  use(backend);
  await setDailyVote(date, `${date}-2`, true);
  await setDailyVote(date, `${date}-2`, false);
  assert.deepEqual(backend.sent, [["add", date, `${date}-2`], ["remove", `${date}-2`]]);
});

test("押す：届かなければ待つ時間を過ぎて失敗になる（画面はやり直しを促す）", async () => {
  const backend = fakeBackend();
  backend.addVote = () => new Promise(() => {});
  use(backend, 30);
  await assert.rejects(setDailyVote(date, `${date}-1`, true));
});
