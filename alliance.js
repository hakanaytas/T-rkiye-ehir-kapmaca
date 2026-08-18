// alliance.js
import {
  collection, doc, addDoc, updateDoc, getDoc, getDocs, query, where,
  serverTimestamp, arrayUnion, arrayRemove, onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase-config.js";
import { pushNotification } from "./notifications.js";

export async function createAlliance(name, ownerUid, ownerName) {
  const ref = await addDoc(collection(db, "alliances"), {
    name,
    ownerUid,
    members: [ownerUid],
    memberNames: { [ownerUid]: ownerName },
    createdAt: serverTimestamp(),
  });
  await updateDoc(doc(db, "players", ownerUid), { allianceId: ref.id });
  return ref.id;
}

export async function sendAllianceInvite(allianceId, allianceName, fromUid, fromName, toUid) {
  await addDoc(collection(db, "allianceInvites"), {
    allianceId,
    allianceName,
    fromUid,
    fromName,
    toUid,
    status: "pending",
    createdAt: serverTimestamp(),
  });
  pushNotification(toUid, "alliance_invite", `🤝 ${fromName} sizi "${allianceName}" ittifakına davet etti.`);
}

export async function acceptAllianceInvite(inviteId, allianceId, uid, username) {
  await updateDoc(doc(db, "allianceInvites", inviteId), { status: "accepted" });
  await updateDoc(doc(db, "alliances", allianceId), {
    members: arrayUnion(uid),
    [`memberNames.${uid}`]: username,
  });
  await updateDoc(doc(db, "players", uid), { allianceId });
}

export async function declineAllianceInvite(inviteId) {
  await updateDoc(doc(db, "allianceInvites", inviteId), { status: "declined" });
}

export async function leaveAlliance(allianceId, uid) {
  await updateDoc(doc(db, "alliances", allianceId), {
    members: arrayRemove(uid),
    [`ceasefireUntil.${uid}`]: Date.now() + 1000 * 60 * 30, // 30 dakika ateşkes
  });
  await updateDoc(doc(db, "players", uid), { allianceId: null });
}

export async function areAllied(uidA, uidB) {
  if (!uidA || !uidB || uidA === uidB) return false;
  const [pa, pb] = await Promise.all([
    getDoc(doc(db, "players", uidA)),
    getDoc(doc(db, "players", uidB)),
  ]);
  const aAlliance = pa.exists() ? pa.data().allianceId : null;
  const bAlliance = pb.exists() ? pb.data().allianceId : null;
  return !!aAlliance && aAlliance === bAlliance;
}

export function listenMyInvites(uid, callback) {
  const q = query(collection(db, "allianceInvites"), where("toUid", "==", uid), where("status", "==", "pending"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export function listenAlliance(allianceId, callback) {
  return onSnapshot(doc(db, "alliances", allianceId), (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  });
}
