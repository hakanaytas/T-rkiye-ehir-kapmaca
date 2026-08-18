// reactions.js
// Eğlence amaçlı emoji/nesne gönderme: bir oyuncu emoji seçtiğinde
// diğer oyuncuların ekranında (harita + sohbet alanında) kısa animasyonla belirir.
// Kalıcı veri tutulmaz: gönderen, kendi kaydını birkaç saniye sonra siler.

import {
  collection, addDoc, deleteDoc, onSnapshot, serverTimestamp, query, orderBy, limit,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase-config.js";

export const REACTIONS = [
  { emoji: "🍉", label: "Karpuz" },
  { emoji: "🍌", label: "Muz" },
  { emoji: "🍕", label: "Pizza" },
  { emoji: "💣", label: "Bomba" },
  { emoji: "🔥", label: "Ateş" },
  { emoji: "❤️", label: "Kalp" },
  { emoji: "😂", label: "Kahkaha" },
  { emoji: "😎", label: "Gözlük" },
  { emoji: "👑", label: "Taç" },
  { emoji: "⚡", label: "Şimşek" },
];

const SELF_CLEANUP_MS = 4000;

export async function sendReaction({ provinceId, uid, name, emoji }) {
  const ref = await addDoc(collection(db, "reactions"), {
    provinceId,
    uid,
    name,
    emoji,
    ts: serverTimestamp(),
  });
  setTimeout(() => deleteDoc(ref).catch(() => {}), SELF_CLEANUP_MS);
  return ref;
}

/** Belirli bir ile ait yeni tepkileri dinler (o ilin sohbetini açan herkes görür). */
export function listenReactions(provinceId, callback) {
  const q = query(collection(db, "reactions"), orderBy("ts", "desc"), limit(20));
  let firstSnapshot = true;
  return onSnapshot(q, (snap) => {
    if (firstSnapshot) {
      firstSnapshot = false;
      return;
    }
    snap.docChanges().forEach((change) => {
      if (change.type !== "added") return;
      const data = change.doc.data();
      if (data.provinceId === provinceId) callback(data);
    });
  });
}
