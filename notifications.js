// notifications.js
import {
  collection, addDoc, doc, updateDoc, query, orderBy, limit, onSnapshot, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase-config.js";

const ICONS = {
  attack: "⚔️",
  conquest: "🏆",
  alliance_invite: "🤝",
  resource: "💰",
  info: "🔔",
};

export async function pushNotification(uid, type, text) {
  if (!uid) return;
  await addDoc(collection(db, "notifications", uid, "items"), {
    type,
    text,
    read: false,
    ts: serverTimestamp(),
  });
}

export async function markRead(uid, notifId) {
  await updateDoc(doc(db, "notifications", uid, "items", notifId), { read: true });
}

export function listenNotifications(uid, callback) {
  const q = query(collection(db, "notifications", uid, "items"), orderBy("ts", "desc"), limit(30));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

/** Ekranın üstünde birkaç saniye görünüp kaybolan küçük toast bildirimi. */
export function showToast(type, text) {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = `${ICONS[type] || "🔔"} ${text}`;
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 300);
  }, 4000);
}
