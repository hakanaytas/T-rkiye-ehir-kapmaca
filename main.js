// main.js
// Uygulamanın orkestrasyonu: giriş, harita, il paneli, sohbet, saldırı ve tepki akışları.

import {
  auth, db, onAuthStateChanged, signInAnonymously, updateProfile, colorForUid,
} from "./firebase-config.js";
import {
  doc, setDoc, onSnapshot, serverTimestamp, collection, query, where, orderBy, limit,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { PROVINCE_NAMES } from "./provinces-data.js";
import { initMap, setProvinceColor, getProvinceScreenCenter, flashProvince, getProvincePath } from "./map.js";
import { sendMessage, listenMessages } from "./chat.js";
import { sendReaction, REACTIONS } from "./reactions.js";
import { attackProvince, listenProvinceStates, listenAttacks, canAttackNow, cooldownRemaining } from "./attack.js";
import { showToast, showBigBanner } from "./notifications.js";

// ---------------------------------------------------------------- state
let myUid = null;
let myName = "";
let myColor = "#2fe6c4";
let myTeamLabel = "";
let myProvinceId = null;      // oyuncunun "ana ili"
let selectedProvinceId = null; // haritada seçili / panelde açık il
let provinceStates = {};       // id -> {capturedByName,color,label,...} | null

let unsubMembers = null;
let unsubChat = null;

// ---------------------------------------------------------------- DOM
const $ = (id) => document.getElementById(id);
const onboard = $("onboard");
const nicknameInput = $("nickname-input");
const meName = $("me-name");
const meDot = $("me-dot");
const statOnline = $("stat-online");
const statCaptured = $("stat-captured");
const mapHint = $("map-hint");
const provinceSheet = $("province-sheet");
const chatSheet = $("chat-sheet");
const pName = $("p-name");
const pStatus = $("p-status");
const pMeta = $("p-meta");
const joinBtn = $("p-join-btn");
const attackBtn = $("p-attack-btn");
const chatToggleBtn = $("p-chat-toggle");
const chatTitle = $("chat-title");
const chatMessages = $("chat-messages");
const chatForm = $("chat-form");
const chatInput = $("chat-input");
const emojiBar = $("emoji-bar");

// ---------------------------------------------------------------- onboarding
const savedName = localStorage.getItem("fetih_nickname");
if (savedName) nicknameInput.value = savedName;

$("onboard-start").addEventListener("click", startFromOnboard);
nicknameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") startFromOnboard(); });

function startFromOnboard() {
  const name = nicknameInput.value.trim().slice(0, 16) || `Gezgin${Math.floor(Math.random() * 900 + 100)}`;
  localStorage.setItem("fetih_nickname", name);
  myName = name;
  onboard.classList.add("hidden");
  boot();
}

$("me-btn").addEventListener("click", () => {
  const next = window.prompt("Ekip etiketin (illeri ele geçirince görünür, ör. \"Hakan'ın Ekibi\"):", myTeamLabel || `${myName}'in Ekibi`);
  if (next === null) return;
  myTeamLabel = next.trim().slice(0, 24);
  savePlayerDoc();
});

// ---------------------------------------------------------------- boot / auth
let booted = false;
function boot() {
  if (booted) return;
  booted = true;
  onAuthStateChanged(auth, (user) => {
    if (user) {
      myUid = user.uid;
      myColor = colorForUid(myUid);
      meDot.style.background = myColor;
      meName.textContent = myName;
      updateProfile(user, { displayName: myName }).catch(() => {});
      listenSelf();
      savePlayerDoc();
      setInterval(savePlayerDoc, 25000); // varlık (presence) sinyali
      startMap();
    } else {
      signInAnonymously(auth).catch((err) => {
        console.error(err);
        showToast("Bağlantı kurulamadı, sayfayı yenile.", "⚠️");
      });
    }
  });
}

function savePlayerDoc() {
  if (!myUid) return;
  setDoc(doc(db, "players", myUid), {
    name: myName,
    color: myColor,
    teamLabel: myTeamLabel || `${myName}'in Ekibi`,
    provinceId: myProvinceId,
    lastSeen: serverTimestamp(),
  }, { merge: true }).catch(() => {});
}

function listenSelf() {
  onSnapshot(doc(db, "players", myUid), (snap) => {
    const data = snap.data();
    if (!data) return;
    myProvinceId = data.provinceId ?? null;
    myTeamLabel = data.teamLabel || myTeamLabel;
    renderProvinceSheet();
  });

  // Toplam aktif oyuncu sayacı (basit; son 15 dk aktif olanlar).
  onSnapshot(collection(db, "players"), (snap) => {
    const now = Date.now();
    let online = 0;
    snap.forEach((d) => {
      const ls = d.data().lastSeen;
      const ms = ls?.toMillis ? ls.toMillis() : (ls ? Date.parse(ls) : 0);
      if (now - ms < 15 * 60 * 1000) online++;
    });
    statOnline.querySelector("b").textContent = String(online || snap.size);
  });
}

// ---------------------------------------------------------------- harita
async function startMap() {
  const svg = $("map-svg");
  try {
    await initMap(svg, onProvinceClick);
  } catch (e) {
    console.error(e);
    $("map-loading").textContent = "Harita yüklenemedi. Bağlantını kontrol edip sayfayı yenile.";
    return;
  }
  $("map-loading").classList.add("hidden");

  listenProvinceStates((states) => {
    provinceStates = states;
    let capturedCount = 0;
    for (const idStr of Object.keys(PROVINCE_NAMES)) {
      const s = states[idStr];
      setProvinceColor(Number(idStr), s ? s.color : null);
      if (s) capturedCount++;
    }
    statCaptured.querySelector("b").textContent = String(capturedCount);
    if (selectedProvinceId) renderProvinceSheet();
  });

  listenAttacks((attack) => playAttackAnimation(attack));

  // Global (tüm illerdeki) tepkileri dinleyip haritada patlatmak için:
  onSnapshotAllReactions();
}

let prevSelectedPath = null;
function onProvinceClick(id) {
  if (prevSelectedPath) prevSelectedPath.classList.remove("selected");
  const path = getProvincePath(id);
  if (path) { path.classList.add("selected"); prevSelectedPath = path; }

  selectedProvinceId = id;
  mapHint.classList.add("hidden");
  openProvinceSheet(id);
}

// ---------------------------------------------------------------- il paneli
function openProvinceSheet(id) {
  renderProvinceSheet();
  provinceSheet.classList.add("open");

  if (unsubMembers) unsubMembers();
  const q = query(collection(db, "players"), where("provinceId", "==", id));
  unsubMembers = onSnapshot(q, (snap) => {
    const count = snap.size;
    pMeta.textContent = `${count} oyuncu bu ilde`;
  });
}

function renderProvinceSheet() {
  if (!selectedProvinceId) return;
  const id = selectedProvinceId;
  const name = PROVINCE_NAMES[id];
  const state = provinceStates[id];

  pName.textContent = name;
  pStatus.textContent = state ? "🔥 ELE GEÇİRİLMİŞ" : "SAHİPSİZ İL";
  pStatus.style.color = state ? "var(--gold)" : "var(--teal)";

  const isHome = myProvinceId === id;
  joinBtn.textContent = isHome ? "Ana İlin ✓" : "Bu İle Katıl";
  joinBtn.disabled = isHome;

  attackBtn.disabled = !myProvinceId || isHome;
  attackBtn.textContent = state ? "Yeniden Ele Geçir ⚔️" : "Saldır ⚔️";

  chatTitle.textContent = `${name} Sohbeti`;
}

$("p-close").addEventListener("click", () => {
  provinceSheet.classList.remove("open");
  if (prevSelectedPath) prevSelectedPath.classList.remove("selected");
  selectedProvinceId = null;
  if (unsubMembers) unsubMembers();
});

joinBtn.addEventListener("click", () => {
  if (!selectedProvinceId) return;
  myProvinceId = selectedProvinceId;
  savePlayerDoc();
  showToast(`${PROVINCE_NAMES[selectedProvinceId]} artık ana ilin!`, "🏠");
  renderProvinceSheet();
});

attackBtn.addEventListener("click", async () => {
  if (!myProvinceId || !selectedProvinceId) return;
  if (!canAttackNow()) {
    showToast(`Biraz bekle: ${Math.ceil(cooldownRemaining() / 1000)}sn`, "⏳");
    return;
  }
  const res = await attackProvince({
    fromProvinceId: myProvinceId,
    toProvinceId: selectedProvinceId,
    uid: myUid,
    playerName: myName,
    color: myColor,
    label: myTeamLabel || `${myName}'in Ekibi`,
  });
  if (res.ok) {
    showToast(`${PROVINCE_NAMES[myProvinceId]} → ${PROVINCE_NAMES[selectedProvinceId]} saldırısı yola çıktı!`, "⚔️");
  }
});

// ---------------------------------------------------------------- saldırı animasyonu
function playAttackAnimation(attack) {
  const from = getProvinceScreenCenter(attack.from);
  const to = getProvinceScreenCenter(attack.to);
  if (!from || !to) return;
  const fx = $("fx-layer");

  const dx = to.x - from.x, dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  const duration = Math.min(1.4, Math.max(0.5, dist / 700));

  const proj = document.createElement("div");
  proj.className = "fx-projectile";
  proj.textContent = "⚔️";
  proj.style.offsetPath = `path('M${from.x},${from.y} L${to.x},${to.y}')`;
  proj.style.animationDuration = `${duration}s`;
  fx.appendChild(proj);

  setTimeout(() => {
    proj.remove();
    const boom = document.createElement("div");
    boom.className = "fx-boom";
    boom.textContent = "💥";
    boom.style.left = `${to.x}px`;
    boom.style.top = `${to.y}px`;
    fx.appendChild(boom);

    const ring = document.createElement("div");
    ring.className = "fx-ring";
    ring.style.left = `${to.x}px`;
    ring.style.top = `${to.y}px`;
    fx.appendChild(ring);

    flashProvince(attack.to);
    setTimeout(() => { boom.remove(); ring.remove(); }, 900);

    showBigBanner(`${PROVINCE_NAMES[attack.to].toLocaleUpperCase("tr")} ELE GEÇİRİLDİ!`, `${attack.byName} saldırdı`);
    addFloatingLabel(attack.to);
  }, duration * 1000);
}

function addFloatingLabel(provinceId) {
  const pos = getProvinceScreenCenter(provinceId);
  if (!pos) return;
  const layer = $("label-layer");
  const state = provinceStates[provinceId];
  const label = state?.label || state?.capturedByName || "";
  if (!label) return;
  const el = document.createElement("div");
  el.className = "floating-label";
  el.textContent = label;
  el.style.left = `${pos.x}px`;
  el.style.top = `${pos.y}px`;
  layer.appendChild(el);
  setTimeout(() => el.remove(), 6000);
}

// ---------------------------------------------------------------- sohbet paneli
chatToggleBtn.addEventListener("click", () => {
  chatSheet.classList.add("open");
  bindChat(selectedProvinceId);
});
$("chat-close").addEventListener("click", () => {
  chatSheet.classList.remove("open");
  if (unsubChat) unsubChat();
});

function bindChat(provinceId) {
  if (unsubChat) unsubChat();
  chatMessages.innerHTML = "";
  unsubChat = listenMessages(provinceId, (msgs) => {
    chatMessages.innerHTML = "";
    if (msgs.length === 0) {
      const empty = document.createElement("div");
      empty.className = "chat-empty";
      empty.textContent = "Henüz mesaj yok. İlk mesajı sen at! 👋";
      chatMessages.appendChild(empty);
    }
    for (const m of msgs) chatMessages.appendChild(renderMessage(m));
    chatMessages.scrollTop = chatMessages.scrollHeight;
  });
}

function renderMessage(m) {
  const wrap = document.createElement("div");
  wrap.className = "msg" + (m.uid === myUid ? " mine" : "") + (m.kind === "reaction" ? " reaction" : "");

  const avatar = document.createElement("div");
  avatar.className = "msg-avatar";
  avatar.style.background = m.color || "#2fe6c4";
  avatar.textContent = (m.name || "?").slice(0, 1).toLocaleUpperCase("tr");

  const bubbleWrap = document.createElement("div");
  const nameEl = document.createElement("div");
  nameEl.className = "msg-name";
  nameEl.textContent = m.name || "Anonim";
  const bubble = document.createElement("div");
  bubble.className = "msg-bubble";
  bubble.textContent = m.kind === "reaction" ? m.emoji : m.text;

  bubbleWrap.appendChild(nameEl);
  bubbleWrap.appendChild(bubble);
  wrap.appendChild(avatar);
  wrap.appendChild(bubbleWrap);
  return wrap;
}

chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = chatInput.value;
  if (!text.trim() || !selectedProvinceId) return;
  sendMessage({ provinceId: selectedProvinceId, uid: myUid, name: myName, color: myColor, text });
  chatInput.value = "";
});

// ---------------------------------------------------------------- emoji / nesne barı
for (const r of REACTIONS) {
  const btn = document.createElement("button");
  btn.className = "emoji-btn";
  btn.type = "button";
  btn.title = r.label;
  btn.textContent = r.emoji;
  btn.addEventListener("click", () => {
    if (!selectedProvinceId) return;
    sendMessage({ provinceId: selectedProvinceId, uid: myUid, name: myName, color: myColor, text: "", kind: "reaction", emoji: r.emoji });
    sendReaction({ provinceId: selectedProvinceId, uid: myUid, name: myName, emoji: r.emoji });
  });
  emojiBar.appendChild(btn);
}

function onSnapshotAllReactions() {
  // Herhangi bir ilde gönderilen tepkiyi haritada patlat (o il ekranda görünmese de).
  const q = query(collection(db, "reactions"), orderBy("ts", "desc"), limit(20));
  let first = true;
  onSnapshot(q, (snap) => {
    if (first) { first = false; return; }
    snap.docChanges().forEach((change) => {
      if (change.type !== "added") return;
      burstReactionOnMap(change.doc.data());
    });
  });
}

function burstReactionOnMap(data) {
  const pos = getProvinceScreenCenter(data.provinceId);
  if (!pos) return;
  const fx = $("fx-layer");
  const el = document.createElement("div");
  el.className = "fx-reaction";
  el.textContent = data.emoji;
  el.style.left = `${pos.x + (Math.random() * 30 - 15)}px`;
  el.style.top = `${pos.y}px`;
  fx.appendChild(el);
  setTimeout(() => el.remove(), 1900);
}
