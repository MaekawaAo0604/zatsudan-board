// 画面の決めごとのうち、テストで確かめたいものをここにまとめる。
// DOM や保存先に触らないので、Node のテスト（tests/）からそのまま読み込める。
// 決めごとの理由は CLAUDE.md の「画面の機能」を参照。

export function formatDate(date) {
  const [y, m, d] = date.split("-").map(Number);
  const week = "日月火水木金土"[new Date(y, m - 1, d).getDay()];
  return `${y}年${m}月${d}日（${week}）`;
}

// 「今日のネタ」（data/topics.json の分）だけを返す。みんなが足したおすすめは含めない
export function dailyTopics(day) {
  return day?.topics ?? [];
}

// まだ話していない「今日のネタ」から1つ選ぶ。おすすめは選ばない。
// 2つ以上残っていれば直前と同じものは避ける。残りがなければ null を返す
export function pickTopic({ day, suggestions = [], doneIds = [], previousId = null }, random = Math.random) {
  void suggestions; // 画面にはあるが、ここでは使わない（決めごとのため）
  const done = new Set(doneIds);
  const remaining = dailyTopics(day).filter((t) => !done.has(t.id));
  if (!remaining.length) return null;
  const candidates = remaining.length > 1 ? remaining.filter((t) => t.id !== previousId) : remaining;
  return candidates[Math.floor(random() * candidates.length)];
}

// LINE や Slack にそのまま貼れる、飾りのない文字だけのまとめを作る。
// 対象は「今日のネタ」だけで、おすすめは含めない
export function buildCopyText({ date, day, suggestions = [], doneIds = [] }) {
  void suggestions; // 画面にはあるが、ここでは使わない（決めごとのため）
  const done = new Set(doneIds);
  const lines = dailyTopics(day).map((t) => {
    const detail = t.detail ? `（${t.detail}）` : "";
    const mark = done.has(t.id) ? " ✓話した" : "";
    return `・${t.title}${detail}${mark}`;
  });
  return [`${formatDate(date)}の雑談ネタ`, ...lines].join("\n");
}
