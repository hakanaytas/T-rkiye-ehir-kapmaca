// finale.js
// "Hazırım / Bitir" onay sistemi: aktif oyuncuların hepsi hazır olduğunda
// tek bir ortak "final" dokümanı tetiklenir ve herkesin ekranında aynı anda
// final animasyonu oynar.

import {
  doc, setDoc, updateDoc, onSnapshot, collection, serverTimestamp, getDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase-config.js";
import { logEvent } from "./events.js";

const ACTIVE_WINDOW_MS = 15 * 60 * 1000;
const finaleRef = doc(db, "meta", "finale");

export async function setReady(uid, ready) {
  await updateDoc(doc(db, "players", uid), { ready: !!ready }).catch(async () => {
    await setDoc(doc(db, "players", uid), { ready: !!ready }, { merge: true });
  });
}

/** Aktif oyuncuların hazır-olma durumunu dinler; {readyCount, total} döner. */
export function listenReadiness(callback) {
  return onSnapshot(collection(db, "players"), (snap) => {
    const now = Date.now();
    let total = 0;
    let readyCount = 0;
    snap.forEach((d) => {
      const p = d.data();
      const ls = p.lastSeen;
      const ms = ls?.toMillis ? ls.toMillis() : (ls ? Date.parse(ls) : 0);
      if (now - ms > ACTIVE_WINDOW_MS) return;
      total++;
      if (p.ready) readyCount++;
    });
    callback({ readyCount, total });
  });
}

/** Herkes hazırsa (en az 2 aktif oyuncu) ortak final dokümanını tetikler. */
export async function checkAndTriggerFinale(readyCount, total) {
  if (total < 2 || readyCount < total) return;
  const snap = await getDoc(finaleRef);
  if (snap.exists() && snap.data().triggeredAt) return; // zaten tetiklendi
  await setDoc(finaleRef, { triggeredAt: serverTimestamp(), playerCount: total }, { merge: true });
  logEvent("🎉 Tüm oyuncular hazır! Türkiye birleşiyor...", "🎉");
}

/** Final tetiklendiğinde herkese bildirir. */
export function listenFinale(callback) {
  return onSnapshot(finaleRef, (snap) => {
    if (snap.exists() && snap.data().triggeredAt) callback(snap.data());
  });
}

/** Yeni bir oyun turu için final durumunu sıfırlar (opsiyonel, ör. sayfa yenilendiğinde manuel çağrılabilir). */
export async function resetFinale() {
  await setDoc(finaleRef, { triggeredAt: null }, { merge: true });
}
