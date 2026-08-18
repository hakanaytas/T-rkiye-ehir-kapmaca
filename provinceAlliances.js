// provinceAlliances.js
// İller arasında (oyuncu grupları arasında) kurulan ittifaklar.
// Not: alliance.js dosyasındaki oyuncu-ittifak sisteminden BAĞIMSIZDIR;
// burada "iki il birbirine ittifaklı mı" bilgisi tutulur ve haritada
// bağlantı çizgisiyle gösterilir.

import {
  collection, addDoc, doc, updateDoc, getDocs, query, where, onSnapshot,
  serverTimestamp, arrayUnion,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase-config.js";
import { logEvent } from "./events.js";
import { PROVINCE_NAMES } from "./provinces-data.js";

function pairKey(a, b) {
  const [x, y] = [Number(a), Number(b)].sort((m, n) => m - n);
  return `${x}_${y}`;
}

/** İki il arasında ittifak teklifi gönderir (teklif "pending" olarak kaydedilir). */
export async function proposeProvinceAlliance(fromProvinceId, toProvinceId, uid, name) {
  if (Number(fromProvinceId) === Number(toProvinceId)) return { ok: false, reason: "same" };
  const key = pairKey(fromProvinceId, toProvinceId);
  const existing = await getDocs(query(collection(db, "provinceAlliances"), where("key", "==", key)));
  let already = false;
  existing.forEach((d) => {
    const st = d.data().status;
    if (st === "accepted" || st === "pending") already = true;
  });
  if (already) return { ok: false, reason: "exists" };

  await addDoc(collection(db, "provinceAlliances"), {
    key,
    fromProvinceId: Number(fromProvinceId),
    toProvinceId: Number(toProvinceId),
    fromUid: uid,
    fromName: name,
    status: "pending",
    createdAt: serverTimestamp(),
  });

  logEvent(`🤝 ${PROVINCE_NAMES[fromProvinceId]} ili, ${PROVINCE_NAMES[toProvinceId]} iline ittifak teklif etti.`, "🤝");
  return { ok: true };
}

/** Teklifi kabul eder; iki il de birbirinin ittifak listesine eklenir. */
export async function acceptProvinceAlliance(allianceId, fromProvinceId, toProvinceId) {
  await updateDoc(doc(db, "provinceAlliances", allianceId), { status: "accepted", acceptedAt: serverTimestamp() });
  await updateDoc(doc(db, "provinces", String(fromProvinceId)), { alliedWith: arrayUnion(Number(toProvinceId)) });
  await updateDoc(doc(db, "provinces", String(toProvinceId)), { alliedWith: arrayUnion(Number(fromProvinceId)) });
  logEvent(`🤝 ${PROVINCE_NAMES[fromProvinceId]} ile ${PROVINCE_NAMES[toProvinceId]} ittifak kurdu!`, "🤝");
}

export async function declineProvinceAlliance(allianceId) {
  await updateDoc(doc(db, "provinceAlliances", allianceId), { status: "declined" });
}

/** Bana (ilime) gelen bekleyen ittifak tekliflerini dinler. */
export function listenIncomingAllianceOffers(myProvinceId, callback) {
  const q = query(
    collection(db, "provinceAlliances"),
    where("toProvinceId", "==", Number(myProvinceId)),
    where("status", "==", "pending")
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

/** Kabul edilmiş tüm ittifak çiftlerini (haritada çizgi çizmek için) dinler. */
export function listenAllAcceptedAlliances(callback) {
  const q = query(collection(db, "provinceAlliances"), where("status", "==", "accepted"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}
