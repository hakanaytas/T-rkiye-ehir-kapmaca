// bubbles.js
// Bir ilin üzerinde kısa süreliğine beliren, uçuşan sohbet baloncukları.
// reactions.js ile aynı desen: gönderen birkaç saniye sonra kendi kaydını siler,
// kalıcı arşiv oluşturulmaz.

import {
  collection, addDoc, deleteDoc, onSnapshot, serverTimestamp, query, orderBy, limit,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase-config.js";

const SELF_CLEANUP_MS = 4500;

export async function sendBubble({ provinceId, uid, name, text }) {
  const trimmed = (text || "").trim().slice(0, 60);
  if (!trimmed) return null;
  const ref = await addDoc(collection(db, "bubbles"), {
    provinceId,
    uid,
    name,
    text: trimmed,
    ts: serverTimestamp(),
  });
  setTimeout(() => deleteDoc(ref).catch(() => {}), SELF_CLEANUP_MS);
  return ref;
}

/** Yeni gönderilen tüm baloncukları dinler; harita üzerindeki ilgili il üzerinde gösterilir. */
export function listenBubbles(callback) {
  const q = query(collection(db, "bubbles"), orderBy("ts", "desc"), limit(20));
  let first = true;
  return onSnapshot(q, (snap) => {
    if (first) { first = false; return; }
    snap.docChanges().forEach((change) => {
      if (change.type === "added") callback({ id: change.doc.id, ...change.doc.data() });
    });
  });
}
