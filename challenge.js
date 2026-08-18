// challenge.js
// "Meydan Okuma" sistemi: bir il grubu başka bir ile meydan okur, kabul edilirse
// hızlı bir mini oyunla (taş-kağıt-makas, emoji düellosu, hız testi, bilgi yarışı)
// düello yapılır. Kazananın ili "destek" puanı kazanır. Asker/kaynak YOKTUR.

import {
  collection, addDoc, doc, updateDoc, runTransaction, onSnapshot,
  query, where, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase-config.js";
import { PROVINCE_NAMES } from "./provinces-data.js";
import { logEvent } from "./events.js";
import { resolveRps, resolveEmoji, gameTypeMeta } from "./minigame.js";

const CHALLENGE_COOLDOWN_MS = 8 * 1000;
let lastChallengeAt = 0;
export function canChallengeNow() { return Date.now() - lastChallengeAt >= CHALLENGE_COOLDOWN_MS; }
export function challengeCooldownRemaining() { return Math.max(0, CHALLENGE_COOLDOWN_MS - (Date.now() - lastChallengeAt)); }

/** Yeni bir meydan okuma gönderir. */
export async function sendChallenge({ fromProvinceId, toProvinceId, uid, name, gameType }) {
  if (Number(fromProvinceId) === Number(toProvinceId)) return { ok: false, reason: "same" };
  if (!canChallengeNow()) return { ok: false, reason: "cooldown" };
  lastChallengeAt = Date.now();

  const ref = await addDoc(collection(db, "challenges"), {
    fromProvinceId: Number(fromProvinceId),
    toProvinceId: Number(toProvinceId),
    fromUid: uid,
    fromName: name,
    toUid: null,
    toName: null,
    gameType,
    status: "pending", // pending -> accepted -> finished | declined
    choices: {},
    ts: serverTimestamp(),
  });

  const meta = gameTypeMeta(gameType);
  logEvent(`${meta.emoji} ${PROVINCE_NAMES[fromProvinceId]}, ${PROVINCE_NAMES[toProvinceId]} iline "${meta.label}" ile meydan okudu!`, meta.emoji);
  return { ok: true, id: ref.id };
}

/** Hedef ildeki bir oyuncu, tekliği kabul eder (ilk kabul eden düelloyu temsil eder). */
export async function acceptChallenge(challengeId, uid, name) {
  const ref = doc(db, "challenges", challengeId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Meydan okuma bulunamadı.");
    const data = snap.data();
    if (data.status !== "pending") throw new Error("Bu meydan okuma artık geçerli değil.");
    tx.update(ref, {
      status: "accepted",
      toUid: uid,
      toName: name,
      acceptedAt: serverTimestamp(),
    });
    return { ...data, id: challengeId };
  });
}

export async function declineChallenge(challengeId) {
  await updateDoc(doc(db, "challenges", challengeId), { status: "declined" });
}

/** Bana (ilime) gelen, henüz kabul edilmemiş meydan okumaları dinler. */
export function listenIncomingChallenges(myProvinceId, callback) {
  const q = query(
    collection(db, "challenges"),
    where("toProvinceId", "==", Number(myProvinceId)),
    where("status", "==", "pending")
  );
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}

/** Benim taraf olduğum (gönderen ya da kabul eden) aktif/tamamlanmış meydan okumaları dinler. */
export function listenMyChallenges(uid, callback) {
  const qFrom = query(collection(db, "challenges"), where("fromUid", "==", uid));
  const qTo = query(collection(db, "challenges"), where("toUid", "==", uid));
  let latestFrom = [];
  let latestTo = [];
  const emit = () => {
    const map = new Map();
    for (const d of [...latestFrom, ...latestTo]) map.set(d.id, d);
    callback([...map.values()]);
  };
  const u1 = onSnapshot(qFrom, (snap) => { latestFrom = snap.docs.map((d) => ({ id: d.id, ...d.data() })); emit(); });
  const u2 = onSnapshot(qTo, (snap) => { latestTo = snap.docs.map((d) => ({ id: d.id, ...d.data() })); emit(); });
  return () => { u1(); u2(); };
}

async function finishAndReward(challengeData, winnerSide) {
  const winnerProvinceId = winnerSide === "a" ? challengeData.fromProvinceId
    : winnerSide === "b" ? challengeData.toProvinceId
    : null;
  const loserProvinceId = winnerSide === "a" ? challengeData.toProvinceId
    : winnerSide === "b" ? challengeData.fromProvinceId
    : null;

  if (winnerProvinceId) {
    await bumpSupport(winnerProvinceId, +6);
  }
  if (loserProvinceId) {
    await bumpSupport(loserProvinceId, -3);
  }

  const meta = gameTypeMeta(challengeData.gameType);
  if (winnerProvinceId) {
    logEvent(`🏆 ${PROVINCE_NAMES[winnerProvinceId]}, meydan okumayı kazandı ve destek topladı! (${meta.label})`, "🏆");
  } else {
    logEvent(`🤝 ${PROVINCE_NAMES[challengeData.fromProvinceId]} ile ${PROVINCE_NAMES[challengeData.toProvinceId]} berabere kaldı.`, "🤝");
  }
}

async function bumpSupport(provinceId, delta) {
  const ref = doc(db, "provinces", String(provinceId));
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists() ? snap.data() : {};
      const current = typeof data.supportScore === "number" ? data.supportScore : 50;
      const next = Math.max(0, Math.min(100, current + delta));
      tx.set(ref, { ...data, supportScore: next }, { merge: true });
    });
  } catch (e) {
    console.warn("Destek puanı güncellenemedi:", e);
  }
}

/** RPS / Emoji tipi oyunlar için: bir tarafın seçimini kaydeder, iki taraf da seçtiyse sonucu belirler. */
export async function submitChoice(challengeId, uid, value) {
  const ref = doc(db, "challenges", challengeId);
  let finished = null;
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const data = snap.data();
    if (data.status === "finished") return;
    const choices = { ...(data.choices || {}), [uid]: value };
    const aChoice = choices[data.fromUid];
    const bChoice = choices[data.toUid];

    if (aChoice && bChoice) {
      const resolver = data.gameType === "emoji" ? resolveEmoji : resolveRps;
      const result = resolver(aChoice, bChoice);
      const winnerSide = result === "draw" ? null : result;
      tx.update(ref, { choices, status: "finished", winnerSide, finishedAt: serverTimestamp() });
      finished = { ...data, winnerSide };
    } else {
      tx.update(ref, { choices });
    }
  });
  if (finished) await finishAndReward(finished, finished.winnerSide);
}

/** Hız Testi: transaction sırası ile ilk tıklayan kazanır. */
export async function submitClick(challengeId, uid) {
  const ref = doc(db, "challenges", challengeId);
  let finished = null;
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const data = snap.data();
    if (data.status === "finished" || data.winnerUid) return;
    const winnerSide = uid === data.fromUid ? "a" : uid === data.toUid ? "b" : null;
    if (!winnerSide) return;
    tx.update(ref, { status: "finished", winnerUid: uid, winnerSide, finishedAt: serverTimestamp() });
    finished = { ...data, winnerSide };
  });
  if (finished) await finishAndReward(finished, finished.winnerSide);
}

/** Bilgi Yarışı: doğru cevabı ilk veren kazanır; yanlış cevap veren tekrar deneyemez. */
export async function submitTriviaAnswer(challengeId, uid, isCorrect) {
  const ref = doc(db, "challenges", challengeId);
  let finished = null;
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const data = snap.data();
    if (data.status === "finished") return;
    const answered = { ...(data.answered || {}), [uid]: isCorrect ? "correct" : "wrong" };

    if (isCorrect) {
      const winnerSide = uid === data.fromUid ? "a" : uid === data.toUid ? "b" : null;
      tx.update(ref, { answered, status: "finished", winnerSide, finishedAt: serverTimestamp() });
      finished = { ...data, winnerSide };
      return;
    }

    const otherUid = uid === data.fromUid ? data.toUid : data.fromUid;
    const bothWrong = answered[data.fromUid] === "wrong" && answered[data.toUid] === "wrong";
    if (bothWrong) {
      tx.update(ref, { answered, status: "finished", winnerSide: null, finishedAt: serverTimestamp() });
      finished = { ...data, winnerSide: null };
    } else {
      tx.update(ref, { answered });
    }
  });
  if (finished) await finishAndReward(finished, finished.winnerSide);
}
