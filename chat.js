// chat.js
// Her il için geçici, anlık sohbet. Mesajlar kalıcı arşivlenmez:
// belirli bir "oturum dönemi" (ör. 24 saat) içinde yazılır ve sadece
// güncel dönem sorgulanır; dönem değişince sohbet otomatik olarak sıfırlanmış olur.

import {
  collection, addDoc, query, where, orderBy, limit, onSnapshot, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db, ROOM_TTL_MS, currentSession } from "./firebase-config.js";

const MAX_MESSAGES = 60;

function messagesCol(provinceId) {
  return collection(db, "provinces", String(provinceId), "messages");
}

export async function sendMessage({ provinceId, uid, name, color, text, kind = "text", emoji = null }) {
  const trimmed = (text || "").trim().slice(0, 300);
  if (!trimmed && kind === "text") return;
  const now = Date.now();
  await addDoc(messagesCol(provinceId), {
    uid,
    name,
    color,
    text: trimmed,
    kind, // "text" | "reaction"
    emoji,
    session: currentSession(),
    ts: serverTimestamp(),
    expiresAtClient: now + ROOM_TTL_MS,
  });
}

/** Sadece güncel oturuma ait mesajları dinler. */
export function listenMessages(provinceId, callback) {
  const q = query(
    messagesCol(provinceId),
    where("session", "==", currentSession()),
    orderBy("ts", "asc"),
    limit(MAX_MESSAGES)
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}
