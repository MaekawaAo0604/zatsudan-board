// data/topics.json の形式を確かめる。問題があれば一覧を出して終了コード 1。
// 使い方: node .claude/skills/add-daily-topics/validate.mjs data/topics.json
import { readFileSync } from "node:fs";

const file = process.argv[2] ?? "data/topics.json";
const errors = [];

let data;
try {
  data = JSON.parse(readFileSync(file, "utf8"));
} catch (err) {
  console.error(`${file} を JSON として読めません: ${err.message}`);
  process.exit(1);
}

if (!Array.isArray(data?.days)) {
  errors.push("トップレベルに days 配列がありません");
} else {
  const dates = new Set();
  const ids = new Set();
  data.days.forEach((day, i) => {
    const where = `days[${i}]`;
    if (typeof day?.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day.date)) {
      errors.push(`${where}.date が YYYY-MM-DD ではありません: ${JSON.stringify(day?.date)}`);
    } else if (dates.has(day.date)) {
      errors.push(`${where}.date ${day.date} が重複しています`);
    } else {
      dates.add(day.date);
    }
    if (!Array.isArray(day?.topics)) {
      errors.push(`${where}.topics が配列ではありません`);
      return;
    }
    day.topics.forEach((t, j) => {
      const w = `${where}.topics[${j}]`;
      if (typeof t?.id !== "string" || !t.id) errors.push(`${w}.id がありません`);
      // firestore.rules が「日付-数字」の形を前提にしている（外れると「話したい」を押せない）
      else if (!new RegExp(`^${day.date}-\\d{1,3}$`).test(t.id)) errors.push(`${w}.id ${t.id} が「${day.date}-連番」の形ではありません`);
      else if (ids.has(t.id)) errors.push(`${w}.id ${t.id} が重複しています`);
      else ids.add(t.id);
      if (typeof t?.title !== "string" || !t.title.trim()) errors.push(`${w}.title がありません`);
      if (t?.detail !== undefined && typeof t.detail !== "string") errors.push(`${w}.detail が文字列ではありません`);
    });
  });
}

if (errors.length) {
  console.error(errors.map((e) => `- ${e}`).join("\n"));
  process.exit(1);
}
console.log(`OK: ${data.days.length} 日分、${data.days.reduce((n, d) => n + d.topics.length, 0)} 件`);
