// Firebase の設定の値。毎朝のネタの「話したい」をみんなで共有するのに使う（store.js が読み込む）。
//
// 貼り方：Firebase コンソールの「プロジェクトの設定」→「全般」→「マイアプリ」に出る
// const firebaseConfig = { … }; の { と } のあいだの行を、下の「ここに貼る」の行と置き換える。
//
// この値は公開される前提のもの（ブラウザに届くので隠せない）。
// 読み書きできる範囲は firestore.rules で決めていて、Firebase コンソールの「ルール」に同じ文面を貼っている。
// 値が入っていないあいだは、画面の「話したい」の数が「—」になる。

export const firebaseConfig = {
  apiKey: "AIzaSyCllTQ1rkqLSPHLsBJ2G2RQFKIbGjE4aqs",
  authDomain: "zatsudan-board.firebaseapp.com",
  projectId: "zatsudan-board",
  storageBucket: "zatsudan-board.firebasestorage.app",
  messagingSenderId: "827989027278",
  appId: "1:827989027278:web:0e211e1dfebc0e3178639f"
};
