// attack.js
// Basit, eğlence-odaklı saldırı/ele geçirme sistemi.
// Asker, kaynak veya ekonomi YOK: saldırı anında sonuçlanır ve hedef il
// geçici olarak saldıran oyuncunun/ilinin rengine boyanır.

import {
  collection, addDoc, doc, setDoc, onSnapshot, serverTimestamp, query, orderBy, limit,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db, CAPTURE_TTL_MS } from "./firebase-config.js";

const ATTACK_COOLDOWN_MS = 12 * 1000; // Oyuncu spam yapamasın diye istemci taraflı bekleme.
let lastAttackAt = 0;

export function canAttackNow() {
  return Date.now() - lastAttackAt >= ATTACK_COOLDOWN_MS;
}

export function cooldownRemaining() {
  return Math.max(0, ATTACK_COOLDOWN_MS - (Date.now() - lastAttackAt));
}

/**
 * Bir ile saldırı düzenler: hem "attacks" akışına (animasyon tetiklemek için)
 * hem de o ilin durumuna (geçici ele geçirme) yazar.
 */
export async function attackProvince({ fromProvinceId, toProvinceId, uid, playerName, color, label }) {
  if (!canAttackNow()) return { ok: false, reason: "cooldown" };
  lastAttackAt = Date.now();

  const now = Date.now();
  await addDoc(collection(db, "attacks"), {
    from: fromProvinceId,
    to: toProvinceId,
    byUid: uid,
    byName: playerName,
    ts: serverTimestamp(),
    clientTs: now,
  });

  await setDoc(doc(db, "provinces", String(toProvinceId)), {
    capturedByUid: uid,
    capturedByName: playerName,
    capturedFrom: fromProvinceId,
    color: color,
    label: (label || "").trim().slice(0, 24),
    capturedAtClient: now,
    expiresAtClient: now + CAPTURE_TTL_MS,
    capturedAt: serverTimestamp(),
  });

  return { ok: true };
}

/** Tüm illerin anlık durumunu dinler; süresi geçmiş ele geçirmeleri "neutral" gibi ele alır. */
export function listenProvinceStates(callback) {
  return onSnapshot(collection(db, "provinces"), (snap) => {
    const states = {};
    const now = Date.now();
    snap.forEach((d) => {
      const data = d.data();
      const expired = !data.expiresAtClient || data.expiresAtClient < now;
      states[d.id] = expired ? null : data;
    });
    callback(states);
  });
}

/** Son saldırı olaylarını dinler (animasyon tetiklemek için). Sadece yakın zamandakileri işler. */
export function listenAttacks(callback) {
  const q = query(collection(db, "attacks"), orderBy("ts", "desc"), limit(15));
  let firstSnapshot = true;
  return onSnapshot(q, (snap) => {
    if (firstSnapshot) {
      // Sayfa ilk açıldığında geçmiş saldırıları animasyonla oynatma.
      firstSnapshot = false;
      return;
    }
    snap.docChanges().forEach((change) => {
      if (change.type === "added") callback({ id: change.doc.id, ...change.doc.data() });
    });
  });
}
