// 押した数とおすすめの保存先。
// 今はブラウザの localStorage に保存する。あとで共有の保存先に移すときは、
// このファイルの関数の中身だけを差し替えれば app.js はそのまま使える。

const KEY_PREFIX = "zatsudan-board";

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(`${KEY_PREFIX}:${key}`);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(`${KEY_PREFIX}:${key}`, JSON.stringify(value));
  } catch {
    // 保存できない環境（プライベートブラウズなど）では画面上の表示だけ変わる
  }
}

export async function getCounts(date) {
  return read(`counts:${date}`, {});
}

export async function changeCount(date, topicId, delta) {
  const counts = read(`counts:${date}`, {});
  counts[topicId] = Math.max(0, (counts[topicId] ?? 0) + delta);
  write(`counts:${date}`, counts);
  return counts[topicId];
}

// 話し終えたネタの id の一覧
export async function getDone(date) {
  return read(`done:${date}`, []);
}

export async function setDone(date, topicId, done) {
  const list = read(`done:${date}`, []).filter((id) => id !== topicId);
  if (done) list.push(topicId);
  write(`done:${date}`, list);
  return done;
}

export async function getSuggestions(date) {
  return read(`suggestions:${date}`, []);
}

export async function addSuggestion(date, { title, detail, author }) {
  const list = read(`suggestions:${date}`, []);
  const item = {
    id: `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    title,
    detail,
    author,
  };
  list.push(item);
  write(`suggestions:${date}`, list);
  return item;
}

export async function removeSuggestion(date, id) {
  const list = read(`suggestions:${date}`, []).filter((s) => s.id !== id);
  write(`suggestions:${date}`, list);
}
