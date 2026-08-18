// events.js
// Twitch-sohbeti tarzı canlı "Olaylar" akışı. Kalıcı arşiv değildir;
// sadece en güncel N olay tutulur ve dinlenir.

import {
  collection, addDoc, query, orderBy, limit, onSnapshot, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase-config.js";

const MAX_EVENTS = 40;

/** Yeni bir olay kaydeder (herkesin "Olaylar" panelinde görünür). */
export async function logEvent(text, emoji = "✨") {
  try {
    await addDoc(collection(db, "events"), {
      text: (text || "").slice(0, 140),
      emoji,
      ts: serverTimestamp(),
    });
  } catch (e) {
    // Olay kaydı başarısız olsa da oyunun geri kalanı çalışmaya devam etsin.
    console.warn("Olay kaydedilemedi:", e);
  }
}

/** Son olayları (eskiden yeniye sıralı) dinler. */
export function listenEvents(callback) {
  const q = query(collection(db, "events"), orderBy("ts", "desc"), limit(MAX_EVENTS));
  return onSnapshot(q, (snap) => {
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    items.reverse();
    callback(items);
  });
}
