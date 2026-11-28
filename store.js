// 保存先。画面（app.js）はこのファイルの関数だけを使う。
// - 毎朝のネタの「話したい」：みんなで共有する（Firebase の Firestore）
// - それ以外（おすすめとそのコメント、おすすめの「話したい」、「話した」の印）：このブラウザの localStorage
// 分け方の理由は CLAUDE.md の「データの保存」を参照。

import { tallyVotes, voteDocId } from "./board.js?v=20261128"; // ?v= は app.js の説明を参照

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

// ---- おすすめの「話したい」（このブラウザだけ） ----
// 1人1回なので、押したかどうかだけを持つ。

export async function getLocalVotes(date) {
  const counts = read(`counts:${date}`, {});
  // 前は何回でも押せたので、1以上を「押した」とみなす
  return new Set(Object.keys(counts).filter((id) => counts[id] > 0));
}

export async function setLocalVote(date, topicId, on) {
  const counts = read(`counts:${date}`, {});
  if (on) counts[topicId] = 1;
  else delete counts[topicId];
  write(`counts:${date}`, counts);
  return on;
}

// ---- 毎朝のネタの「話したい」（みんなで共有） ----
// 1人が1つのネタに付けた印を1件として Firestore に置き、数は board.js の tallyVotes で数える。
// 数そのものを書き換えないので、同時に押しても数が落ちない。
// 自分の印しか作れない・消せないことは firestore.rules で守る。

const FIREBASE_SDK = "https://www.gstatic.com/firebasejs/13.4.0";
let sharedTimeoutMs = 8000; // これより待っても返事がなければ「つながらない」とする
let loadBackend = loadFirebaseBackend;
let backendPromise = null;

// テストで Firebase の代わりの偽物を使うためのもの。画面からは使わない
export function configureSharedVotesForTest({ load, timeoutMs }) {
  loadBackend = load;
  sharedTimeoutMs = timeoutMs;
  backendPromise = null;
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("時間内に返事がなかった")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function getBackend() {
  if (!backendPromise) {
    const p = withTimeout(Promise.resolve().then(() => loadBackend()), sharedTimeoutMs);
    // 失敗したら覚えておかず、次に使うときにやり直す
    p.catch(() => { if (backendPromise === p) backendPromise = null; });
    backendPromise = p;
  }
  return backendPromise;
}

// その日の「話したい」を受け取り続け、届くたびに onState を呼ぶ。止める関数を返す。
// onState に渡すもの：
//   { status: "loading" }                      まだ返事がない
//   { status: "ready", counts, mine }          サーバーで確かめた数（counts はネタごとの合計、mine は自分が押したネタ）
//   { status: "unavailable" }                  つながらない。手元に残っていた数は、共有の数と取り違えないよう使わない
export function watchDailyVotes(date, onState) {
  let stopped = false;
  let unsubscribe = null;
  let heardFromServer = false;
  let lastStatus = null;
  const emit = (state) => {
    if (stopped) return;
    if (state.status !== "ready" && state.status === lastStatus) return; // 待ち時間切れが2か所から来ても1回だけ知らせる
    lastStatus = state.status;
    onState(state);
  };
  const unavailable = () => emit({ status: "unavailable" });
  const timer = setTimeout(() => { if (!heardFromServer) unavailable(); }, sharedTimeoutMs);

  emit({ status: "loading" });
  getBackend().then((backend) => {
    if (stopped) return;
    unsubscribe = backend.watchVotes(
      date,
      (votes, fromServer) => {
        if (fromServer) {
          heardFromServer = true;
          emit({ status: "ready", ...tallyVotes(votes, backend.uid) });
        } else if (heardFromServer) {
          unavailable(); // 一度つながったあとに切れた
        }
        // まだ一度もつながっていないあいだの手元の数は使わず、返事を待つ
      },
      unavailable,
    );
  }, unavailable);

  return () => {
    stopped = true;
    clearTimeout(timer);
    unsubscribe?.();
  };
}

// 自分の「話したい」を付ける（on が true）か、取り消す。届かなければ例外になる
export async function setDailyVote(date, topicId, on) {
  const backend = await getBackend();
  const sending = on ? backend.addVote(date, topicId) : backend.removeVote(topicId);
  await withTimeout(sending, sharedTimeoutMs);
}

// 本物の Firebase。必要になってから読み込むので、読み込めなくても画面のほかの部分は止まらない
async function loadFirebaseBackend() {
  const { firebaseConfig } = await import("./firebase-config.js?v=20261128");
  if (!firebaseConfig?.projectId) throw new Error("firebase-config.js に設定の値がない");
  const [appSdk, authSdk, fs] = await Promise.all(
    ["app", "auth", "firestore"].map((name) => import(`${FIREBASE_SDK}/firebase-${name}.js`)),
  );
  const app = appSdk.getApps()[0] ?? appSdk.initializeApp(firebaseConfig);
  const auth = authSdk.getAuth(app);
  await auth.authStateReady();
  if (!auth.currentUser) await authSdk.signInAnonymously(auth); // アカウントなしで、ブラウザごとに見分ける
  const uid = auth.currentUser.uid;
  const db = fs.getFirestore(app);
  const voteRef = (topicId) => fs.doc(db, "votes", voteDocId(topicId, uid));

  return {
    uid,
    watchVotes(date, onVotes, onError) {
      const q = fs.query(fs.collection(db, "votes"), fs.where("date", "==", date));
      return fs.onSnapshot(
        q,
        { includeMetadataChanges: true },
        (snap) => onVotes(snap.docs.map((d) => d.data()), !snap.metadata.fromCache),
        onError,
      );
    },
    addVote: (date, topicId) => fs.setDoc(voteRef(topicId), { date, topicId, uid }),
    removeVote: (topicId) => fs.deleteDoc(voteRef(topicId)),
  };
}

// ---- 「話した」の印（このブラウザだけ） ----

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

// ---- おすすめとそのコメント（このブラウザだけ） ----

export async function getSuggestions(date) {
  return read(`suggestions:${date}`, []);
}

function newId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export async function addSuggestion(date, { title, detail, author }) {
  const list = read(`suggestions:${date}`, []);
  const item = {
    id: newId("s"),
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

// おすすめのコメントを書き換えて、書き換えたあとの一覧を返す。
// おすすめがもうなければ（別のタブで削除したときなど）null を返す。
function updateComments(date, suggestionId, update) {
  const list = read(`suggestions:${date}`, []);
  const item = list.find((s) => s.id === suggestionId);
  if (!item) return null;
  item.comments = update(item.comments ?? []); // コメント機能より前に足したおすすめには comments がない
  write(`suggestions:${date}`, list);
  return item.comments;
}

export async function addComment(date, suggestionId, text) {
  return updateComments(date, suggestionId, (comments) => [...comments, { id: newId("c"), text }]);
}

export async function removeComment(date, suggestionId, commentId) {
  return updateComments(date, suggestionId, (comments) => comments.filter((c) => c.id !== commentId));
}
