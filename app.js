import * as store from "./store.js";

const els = {
  date: document.getElementById("current-date"),
  prev: document.getElementById("prev-day"),
  next: document.getElementById("next-day"),
  sort: document.getElementById("sort-order"),
  status: document.getElementById("status"),
  list: document.getElementById("topic-list"),
  form: document.getElementById("suggest-form"),
  template: document.getElementById("topic-template"),
  pick: document.getElementById("random-pick"),
  pickResult: document.getElementById("pick-result"),
  copy: document.getElementById("copy-topics"),
};

let days = []; // data/topics.json の days（日付の昇順）
let dayIndex = -1;
let pickedId = null; // ランダムに選ばれたネタの id（日付を移ると消える）

function todayString() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDate(date) {
  const [y, m, d] = date.split("-").map(Number);
  const week = "日月火水木金土"[new Date(y, m - 1, d).getDay()];
  return `${y}年${m}月${d}日（${week}）`;
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

  const base = dayIndex >= 0 ? days[dayIndex].topics ?? [] : [];
  els.pick.disabled = base.length === 0;
  els.copy.disabled = base.length === 0;
  const picked = base.find((t) => t.id === pickedId);
  els.pickResult.textContent = picked ? `今日はこれ：「${picked.title}」` : "";
  const suggestions = await store.getSuggestions(date);
  const counts = await store.getCounts(date);
  const done = new Set(await store.getDone(date));

  let topics = [
    ...base.map((t) => ({ ...t, kind: "daily" })),
    ...suggestions.map((s) => ({ ...s, kind: "suggestion" })),
  ];
  if (els.sort.value === "count") {
    topics = topics
      .map((t, i) => ({ t, i }))
      .sort((a, b) => (counts[b.t.id] ?? 0) - (counts[a.t.id] ?? 0) || a.i - b.i)
      .map(({ t }) => t);
  }

  els.status.textContent = topics.length ? "" : "この日のネタはまだありません。下から足せます。";
  els.list.replaceChildren(...topics.map((t) => renderTopic(t, date, counts[t.id] ?? 0, done.has(t.id))));
}

function renderTopic(topic, date, count, isDone) {
  const node = els.template.content.firstElementChild.cloneNode(true);
  const isSuggestion = topic.kind === "suggestion";
  node.classList.toggle("is-suggestion", isSuggestion);
  node.classList.toggle("is-picked", !isSuggestion && topic.id === pickedId);
  node.querySelector(".badge").textContent = isSuggestion ? "おすすめ" : "今日のネタ";
  node.querySelector(".author").textContent = isSuggestion && topic.author ? `${topic.author} さん` : "";
  node.querySelector(".topic-title").textContent = topic.title;
  const detail = node.querySelector(".topic-detail");
  detail.textContent = topic.detail ?? "";
  detail.hidden = !topic.detail;

  const countEl = node.querySelector(".count");
  const undo = node.querySelector(".undo-btn");
  const setCount = (n) => {
    countEl.textContent = n;
    undo.disabled = n === 0;
    node.classList.toggle("is-voted", n > 0);
  };
  setCount(count);

  node.querySelector(".vote-btn").addEventListener("click", async () => {
    setCount(await store.changeCount(date, topic.id, 1));
    if (els.sort.value === "count") render();
  });
  undo.addEventListener("click", async () => {
    setCount(await store.changeCount(date, topic.id, -1));
    if (els.sort.value === "count") render();
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
  return node;
}

els.prev.addEventListener("click", () => {
  if (dayIndex > 0) { dayIndex--; pickedId = null; render(); }
});
els.next.addEventListener("click", () => {
  if (dayIndex < days.length - 1) { dayIndex++; pickedId = null; render(); }
});

// 表示中の日の「今日のネタ」のうち、まだ話していないものから1つ選ぶ。
// 2つ以上あれば直前と同じものは避ける
els.pick.addEventListener("click", async () => {
  const base = dayIndex >= 0 ? days[dayIndex].topics ?? [] : [];
  const done = new Set(await store.getDone(currentDate()));
  const remaining = base.filter((t) => !done.has(t.id));
  if (!remaining.length) {
    pickedId = null;
    await render();
    els.pickResult.textContent = "今日のネタはぜんぶ話し終えました。";
    return;
  }
  const candidates = remaining.length > 1 ? remaining.filter((t) => t.id !== pickedId) : remaining;
  pickedId = candidates[Math.floor(Math.random() * candidates.length)].id;
  await render();
  els.list.querySelector(".is-picked")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
});
els.sort.addEventListener("change", render);

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

// LINE や Slack にそのまま貼れる、飾りのない文字だけのまとめを作る
async function buildCopyText() {
  const date = currentDate();
  const base = dayIndex >= 0 ? days[dayIndex].topics ?? [] : [];
  const done = new Set(await store.getDone(date));
  const lines = base.map((t) => {
    const detail = t.detail ? `（${t.detail}）` : "";
    const mark = done.has(t.id) ? " ✓話した" : "";
    return `・${t.title}${detail}${mark}`;
  });
  return [`${formatDate(date)}の雑談ネタ`, ...lines].join("\n");
}

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
  const ok = await copyText(await buildCopyText());
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
  dayIndex = i >= 0 ? i : days.length - 1;
  await render();
}

init();
