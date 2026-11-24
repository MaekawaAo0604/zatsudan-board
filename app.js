// ?v= は版の印。GitHub Pages は各ファイルを10分キャッシュするので、新旧のファイルが混ざらないよう、
// 変えたときは index.html・app.js・store.js の ?v= をそろえて上げる
import * as store from "./store.js?v=20261124";
import { formatDate, dailyTopics, pickTopic, buildCopyText } from "./board.js?v=20261124";

const els = {
  date: document.getElementById("current-date"),
  prev: document.getElementById("prev-day"),
  next: document.getElementById("next-day"),
  sort: document.getElementById("sort-order"),
  status: document.getElementById("status"),
  voteStatus: document.getElementById("vote-status"),
  list: document.getElementById("topic-list"),
  form: document.getElementById("suggest-form"),
  template: document.getElementById("topic-template"),
  commentTemplate: document.getElementById("comment-template"),
  pick: document.getElementById("random-pick"),
  pickResult: document.getElementById("pick-result"),
  copy: document.getElementById("copy-topics"),
};

let days = []; // data/topics.json の days（日付の昇順）
let dayIndex = -1;
let pickedId = null; // ランダムに選ばれたネタの id（日付を移ると消える）
const commentDrafts = new Map(); // 書きかけのコメント。一覧を描き直しても消えないようにする

// 「話したい」。1人1回で、もう一度押すと取り消す。
// 毎朝のネタの分はみんなで共有し、Firebase から届くたびに数字だけを書き換える（一覧は待たずに先に描く）。
// おすすめの分はこのブラウザだけ。
let sharedVotes = { status: "loading", counts: {}, mine: new Set() };
let stopWatchingVotes = () => {};
let localVotes = new Set();
const sendingVotes = new Set(); // 届け中のネタの id（二度押しを防ぐ）
let voteError = "";

const MESSAGE_UNAVAILABLE = "毎朝のネタの「話したい」の数を読み込めませんでした。ネタの一覧とほかのボタンはそのまま使えます。";
const MESSAGE_SEND_FAILED = "「話したい」を届けられませんでした。少し待ってから、もう一度押してください。";

function watchVotes(date) {
  stopWatchingVotes();
  sharedVotes = { status: "loading", counts: {}, mine: new Set() };
  voteError = "";
  stopWatchingVotes = store.watchDailyVotes(date, (state) => {
    sharedVotes = { counts: {}, mine: new Set(), ...state };
    updateVotes();
  });
}

function voteInfo(topic) {
  if (topic.kind === "suggestion") {
    const mine = localVotes.has(topic.id);
    return { available: true, count: mine ? 1 : 0, mine };
  }
  return {
    available: sharedVotes.status === "ready",
    count: sharedVotes.counts[topic.id] ?? 0,
    mine: sharedVotes.mine.has(topic.id),
  };
}

// 一覧は作り直さず、数字と押した色だけを書き換える（コメントの書きかけや入力中の位置を失わないため）
function updateVotes() {
  const nodes = [...els.list.children];
  for (const node of nodes) {
    const info = voteInfo(node.topic);
    const btn = node.querySelector(".vote-btn");
    const label = sharedVotes.status === "loading" ? "…" : "—";
    node.querySelector(".count").textContent = info.available ? info.count : label;
    btn.disabled = !info.available || sendingVotes.has(node.topic.id);
    btn.setAttribute("aria-pressed", String(info.available && info.mine));
    node.classList.toggle("is-voted", info.available && info.mine);
  }
  const hasDaily = nodes.some((node) => node.topic.kind === "daily");
  const message = voteError || (hasDaily && sharedVotes.status === "unavailable" ? MESSAGE_UNAVAILABLE : "");
  // 公開直後に古い index.html がキャッシュに残っていると、この欄がない。そのときも止まらないようにする
  if (els.voteStatus) els.voteStatus.textContent = message;
  sortNodes(nodes);
}

// 並び順を数に合わせる。順番が変わらなければ動かさない（動かすと入力中の欄から外れるため）
function sortNodes(nodes) {
  const byCount = els.sort.value === "count";
  const countOf = (node) => (voteInfo(node.topic).available ? voteInfo(node.topic).count : 0);
  const sorted = [...nodes].sort((a, b) => (byCount ? countOf(b) - countOf(a) : 0) || a.order - b.order);
  if (sorted.some((node, i) => node !== nodes[i])) els.list.append(...sorted);
}

function todayString() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function loadDays() {
  const res = await fetch("data/topics.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`data/topics.json を読めませんでした（${res.status}）`);
  const data = await res.json();
  return [...(data.days ?? [])].sort((a, b) => a.date.localeCompare(b.date));
}

function currentDate() {
  return dayIndex >= 0 ? days[dayIndex].date : todayString();
}

async function render() {
  const date = currentDate();
  const isToday = date === todayString();
  els.date.textContent = formatDate(date) + (isToday ? " 今日" : "");
  els.prev.disabled = dayIndex <= 0;
  els.next.disabled = dayIndex < 0 || dayIndex >= days.length - 1;

  const base = dailyTopics(days[dayIndex]);
  els.pick.disabled = base.length === 0;
  els.copy.disabled = base.length === 0;
  const picked = base.find((t) => t.id === pickedId);
  els.pickResult.textContent = picked ? `今日はこれ：「${picked.title}」` : "";
  // ここで読むのはこのブラウザの中の分だけ。共有の「話したい」は待たない
  const suggestions = await store.getSuggestions(date);
  const local = await store.getLocalVotes(date);
  const done = new Set(await store.getDone(date));
  if (date !== currentDate()) return; // 読んでいるあいだに日付を移った

  localVotes = local;
  const topics = [
    ...base.map((t) => ({ ...t, kind: "daily" })),
    ...suggestions.map((s) => ({ ...s, kind: "suggestion" })),
  ];
  els.status.textContent = topics.length ? "" : "この日のネタはまだありません。下から足せます。";
  els.list.replaceChildren(...topics.map((t, i) => renderTopic(t, date, i, done.has(t.id))));
  updateVotes();
}

function renderTopic(topic, date, order, isDone) {
  const node = els.template.content.firstElementChild.cloneNode(true);
  node.topic = topic;
  node.order = order;
  const isSuggestion = topic.kind === "suggestion";
  node.classList.toggle("is-suggestion", isSuggestion);
  node.classList.toggle("is-picked", !isSuggestion && topic.id === pickedId);
  node.querySelector(".badge").textContent = isSuggestion ? "おすすめ" : "今日のネタ";
  node.querySelector(".author").textContent = isSuggestion && topic.author ? `${topic.author} さん` : "";
  node.querySelector(".topic-title").textContent = topic.title;
  const detail = node.querySelector(".topic-detail");
  detail.textContent = topic.detail ?? "";
  detail.hidden = !topic.detail;

  node.querySelector(".vote-btn").addEventListener("click", async () => {
    const info = voteInfo(topic);
    if (!info.available || sendingVotes.has(topic.id)) return;
    voteError = "";
    if (isSuggestion) {
      await store.setLocalVote(date, topic.id, !info.mine);
      if (info.mine) localVotes.delete(topic.id);
      else localVotes.add(topic.id);
      updateVotes();
      return;
    }
    sendingVotes.add(topic.id);
    updateVotes();
    try {
      // 数は Firebase から届いた分で書き換わる。ここでは足し引きしない
      await store.setDailyVote(date, topic.id, !info.mine);
    } catch {
      if (date === currentDate()) voteError = MESSAGE_SEND_FAILED;
    } finally {
      sendingVotes.delete(topic.id);
      updateVotes();
    }
  });

  const doneBtn = node.querySelector(".done-btn");
  const doneLabel = node.querySelector(".done-label");
  const setDone = (d) => {
    node.classList.toggle("is-done", d);
    doneBtn.textContent = d ? "話したを取り消す" : "話した";
    doneBtn.setAttribute("aria-pressed", String(d));
    doneLabel.hidden = !d;
  };
  setDone(isDone);
  doneBtn.addEventListener("click", async () => {
    setDone(await store.setDone(date, topic.id, !node.classList.contains("is-done")));
  });

  const del = node.querySelector(".delete-btn");
  del.hidden = !isSuggestion;
  del.addEventListener("click", async () => {
    if (!confirm(`「${topic.title}」を削除しますか？`)) return;
    await store.removeSuggestion(date, topic.id);
    render();
  });

  if (isSuggestion) setUpComments(node, topic, date);
  return node;
}

function setUpComments(node, topic, date) {
  const list = node.querySelector(".comment-list");
  const form = node.querySelector(".comment-form");
  const input = node.querySelector(".comment-input");
  const draftKey = `${date}:${topic.id}`;

  const show = (comments) => {
    list.hidden = comments.length === 0;
    list.replaceChildren(...comments.map((comment) => {
      const item = els.commentTemplate.content.firstElementChild.cloneNode(true);
      item.querySelector(".comment-text").textContent = comment.text;
      item.querySelector(".comment-delete").addEventListener("click", async () => {
        if (!confirm(`コメント「${comment.text}」を削除しますか？`)) return;
        const next = await store.removeComment(date, topic.id, comment.id);
        if (!next) return render();
        show(next);
        input.focus();
      });
      return item;
    }));
  };
  show(topic.comments ?? []);

  input.value = commentDrafts.get(draftKey) ?? "";
  input.addEventListener("input", () => commentDrafts.set(draftKey, input.value));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    const next = await store.addComment(date, topic.id, text);
    if (!next) return render();
    commentDrafts.delete(draftKey);
    input.value = "";
    show(next);
  });
  node.querySelector(".comments").hidden = false;
}

function showDay(index) {
  dayIndex = index;
  pickedId = null;
  watchVotes(currentDate());
  render();
}

els.prev.addEventListener("click", () => {
  if (dayIndex > 0) showDay(dayIndex - 1);
});
els.next.addEventListener("click", () => {
  if (dayIndex < days.length - 1) showDay(dayIndex + 1);
});

// 選び方の決めごとは board.js の pickTopic にある（tests/board.test.mjs で確かめている）
els.pick.addEventListener("click", async () => {
  const date = currentDate();
  const picked = pickTopic({
    day: days[dayIndex],
    suggestions: await store.getSuggestions(date),
    doneIds: await store.getDone(date),
    previousId: pickedId,
  });
  if (!picked) {
    pickedId = null;
    await render();
    els.pickResult.textContent = "今日のネタはぜんぶ話し終えました。";
    return;
  }
  pickedId = picked.id;
  await render();
  els.list.querySelector(".is-picked")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
});
els.sort.addEventListener("change", () => sortNodes([...els.list.children]));

els.form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(els.form);
  const title = String(f.get("title")).trim();
  if (!title) return;
  await store.addSuggestion(currentDate(), {
    title,
    detail: String(f.get("detail")).trim(),
    author: String(f.get("author")).trim(),
  });
  els.form.reset();
  render();
});

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // clipboard API が使えない環境向けの昔ながらの方法
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

let copyResetTimer;
els.copy.addEventListener("click", async () => {
  // まとめの中身の決めごとは board.js の buildCopyText にある
  const date = currentDate();
  const text = buildCopyText({
    date,
    day: days[dayIndex],
    suggestions: await store.getSuggestions(date),
    doneIds: await store.getDone(date),
  });
  const ok = await copyText(text);
  els.copy.textContent = ok ? "コピーしました" : "コピーできませんでした";
  clearTimeout(copyResetTimer);
  copyResetTimer = setTimeout(() => { els.copy.textContent = "まとめてコピー"; }, 2000);
});

async function init() {
  try {
    days = await loadDays();
  } catch (err) {
    els.status.textContent = err.message;
    days = [];
  }
  // 今日の分があれば今日、なければ一番新しい日を表示する
  const today = todayString();
  const i = days.findIndex((d) => d.date === today);
  showDay(i >= 0 ? i : days.length - 1);
}

init();
