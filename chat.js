// chat.js
import {
  collection, addDoc, query, orderBy, limit, onSnapshot, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase-config.js";

const MAX_MESSAGES = 50;

export async function sendMessage(uid, username, text) {
  const trimmed = text.trim().slice(0, 300);
  if (!trimmed) return;
  await addDoc(collection(db, "messages"), {
    uid,
    username,
    text: trimmed,
    ts: serverTimestamp(),
  });
}

export function listenMessages(callback) {
  const q = query(collection(db, "messages"), orderBy("ts", "desc"), limit(MAX_MESSAGES));
  return onSnapshot(q, (snap) => {
    const messages = snap.docs.map((d) => ({ id: d.id, ...d.data() })).reverse();
    callback(messages);
  });
}
