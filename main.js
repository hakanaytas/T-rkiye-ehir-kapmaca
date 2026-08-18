// main.js
// Uygulamanın orkestrasyonu: giriş, harita, il paneli, sohbet, saldırı ve tepki akışları.
// EK: gruplar, meydan okuma + mini oyunlar, il ittifakları, canlı "Olaylar" paneli,
// harita üstü sohbet baloncukları ve "Hazırım" final animasyonu.

import {
  auth, db, onAuthStateChanged, signInAnonymously, updateProfile, colorForUid,
} from "./firebase-config.js";
import {
  doc, setDoc, onSnapshot, serverTimestamp, collection, query, where, orderBy, limit,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { PROVINCE_NAMES } from "./provinces-data.js";
import { initMap, setProvinceColor, getProvinceScreenCenter, flashProvince, getProvincePath, renderAllianceLines } from "./map.js";
import { sendMessage, listenMessages } from "./chat.js";
import { sendReaction, REACTIONS } from "./reactions.js";
import { attackProvince, listenProvinceStates, listenAttacks, canAttackNow, cooldownRemaining } from "./attack.js";
import { showToast, showBigBanner } from "./notifications.js";
import { logEvent, listenEvents } from "./events.js";
import { sendBubble, listenBubbles } from "./bubbles.js";
import {
  proposeProvinceAlliance, acceptProvinceAlliance, declineProvinceAlliance,
  listenIncomingAllianceOffers, listenAllAcceptedAlliances,
} from "./provinceAlliances.js";
import {
  GAME_TYPES, RPS_OPTIONS, EMOJI_OPTIONS, pickTriviaQuestion, gameTypeMeta,
} from "./minigame.js";
import {
  sendChallenge, listenIncomingChallenges, listenMyChallenges,
  acceptChallenge, declineChallenge, submitChoice, submitClick, submitTriviaAnswer,
  canChallengeNow, challengeCooldownRemaining,
} from "./challenge.js";
import { setReady, listenReadiness, checkAndTriggerFinale, listenFinale } from "./finale.js";

// ---------------------------------------------------------------- state
let myUid = null;
let myName = "";
let myColor = "#2fe6c4";
let myTeamLabel = "";
let myProvinceId = null;      // oyuncunun "ana ili"
let selectedProvinceId = null; // haritada seçili / panelde açık il
let provinceStates = {};       // id -> {capturedByName,color,label,...} | null
let rawProvinceData = {};      // id -> provinces/{id} ham verisi (supportScore vb.)
let allianceList = [];         // kabul edilmiş il-ittifak çiftleri
let currentChallengeId = null; // şu an düello halinde olduğum meydan okuma
let amReady = false;

let unsubMembers = null;
let unsubChat = null;
let unsubIncomingChallenges = null;
let unsubIncomingAlliance = null;
let lastBoundProvinceId = "__none__";
let seenOfferIds = new Set();
let offerQueue = [];
let activeOffer = null;

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

const eventsToggle = $("events-toggle");
const eventsPanel = $("events-panel");
const eventsClose = $("events-close");
const eventsList = $("events-list");
const readyBtn = $("ready-btn");
const readyLabel = $("ready-label");
const readyCountEl = $("ready-count");
const supportFill = $("support-fill");
const supportPct = $("support-pct");
const groupBadges = $("group-badges");
const challengeBox = $("challenge-box");
const challengeGames = $("challenge-games");
const allianceBtn = $("p-alliance-btn");
const bubbleForm = $("bubble-form");
const bubbleInput = $("bubble-input");
const offerBanner = $("offer-banner");
const offerText = $("offer-text");
const offerAccept = $("offer-accept");
const offerDecline = $("offer-decline");
const minigameModal = $("minigame-modal");
const minigameTitle = $("minigame-title");
const minigameSub = $("minigame-sub");
const minigameContent = $("minigame-content");
const finaleOverlay = $("finale-overlay");
const finaleCountdown = $("finale-countdown");
const finaleText = $("finale-text");
const finaleParticles = $("finale-particles");

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

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
      bindMyChallenges();
      bindReadinessAndFinale();
      listenEvents(renderEvents);
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
    amReady = !!data.ready;
    renderReadyBtn();
    rebindProvinceScopedListeners(myProvinceId);
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

  // İllerin ham verisi (destek puanı vb.) — ele geçirme mantığından bağımsız.
  onSnapshot(collection(db, "provinces"), (snap) => {
    snap.forEach((d) => { rawProvinceData[d.id] = d.data(); });
    if (selectedProvinceId) renderGroupInfo();
  });

  listenAttacks((attack) => playAttackAnimation(attack));

  // Global (tüm illerdeki) tepkileri dinleyip haritada patlatmak için:
  onSnapshotAllReactions();

  // İl ittifakları: haritada bağlantı çizgisi + panelde rozet.
  listenAllAcceptedAlliances((list) => {
    allianceList = list;
    renderAllianceLines(list.map((a) => ({ a: a.fromProvinceId, b: a.toProvinceId })));
    if (selectedProvinceId) renderGroupInfo();
  });

  // Harita üstü kısa sohbet baloncukları.
  listenBubbles((data) => addFloatingBubble(data));
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

  renderGroupInfo();
}

function allianceForProvince(id) {
  const out = [];
  for (const a of allianceList) {
    if (Number(a.fromProvinceId) === Number(id)) out.push(Number(a.toProvinceId));
    else if (Number(a.toProvinceId) === Number(id)) out.push(Number(a.fromProvinceId));
  }
  return out;
}

function renderGroupInfo() {
  if (!selectedProvinceId) return;
  const raw = rawProvinceData[selectedProvinceId] || {};
  const support = typeof raw.supportScore === "number" ? raw.supportScore : 50;
  supportFill.style.width = `${Math.max(0, Math.min(100, support))}%`;
  supportPct.textContent = `${Math.round(support)}%`;

  const allied = allianceForProvince(selectedProvinceId);
  groupBadges.innerHTML = "";
  if (allied.length) {
    for (const otherId of allied) {
      const b = document.createElement("span");
      b.className = "badge badge-gold";
      b.textContent = `🤝 ${PROVINCE_NAMES[otherId]}`;
      groupBadges.appendChild(b);
    }
  } else {
    const b = document.createElement("span");
    b.className = "badge";
    b.textContent = "İttifak yok";
    groupBadges.appendChild(b);
  }

  const isHome = myProvinceId === selectedProvinceId;
  const showCross = !isHome && !!myProvinceId;

  challengeBox.style.display = showCross ? "block" : "none";
  allianceBtn.style.display = showCross ? "block" : "none";

  if (showCross) {
    const alreadyAllied = allied.includes(Number(myProvinceId));
    allianceBtn.disabled = alreadyAllied;
    allianceBtn.textContent = alreadyAllied ? "🤝 Zaten İttifaklısınız" : "🤝 İttifak Teklif Et";
  }
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
  logEvent(`👤 ${myName}, ${PROVINCE_NAMES[selectedProvinceId]} grubuna katıldı.`, "👤");
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

// ================================================================
// EK: Harita üstü sohbet baloncukları
// ================================================================
bubbleForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = bubbleInput.value;
  if (!text.trim() || !selectedProvinceId || !myUid) return;
  sendBubble({ provinceId: selectedProvinceId, uid: myUid, name: myName, text });
  bubbleInput.value = "";
});

function addFloatingBubble({ provinceId, name, text }) {
  const pos = getProvinceScreenCenter(provinceId);
  if (!pos) return;
  const layer = $("bubble-layer");
  const el = document.createElement("div");
  el.className = "speech-bubble";
  el.textContent = `${name}: ${text}`;
  el.style.left = `${pos.x}px`;
  el.style.top = `${pos.y}px`;
  layer.appendChild(el);
  setTimeout(() => el.remove(), 4300);
}

// ================================================================
// EK: Olaylar paneli (canlı akış)
// ================================================================
eventsToggle.addEventListener("click", () => eventsPanel.classList.toggle("open"));
eventsClose.addEventListener("click", () => eventsPanel.classList.remove("open"));

function renderEvents(items) {
  eventsList.innerHTML = "";
  for (const e of items) {
    const row = document.createElement("div");
    row.className = "event-row";
    row.innerHTML = `<span>${e.emoji || "✨"}</span><span>${escapeHtml(e.text || "")}</span>`;
    eventsList.appendChild(row);
  }
  eventsList.scrollTop = eventsList.scrollHeight;
}

// ================================================================
// EK: İl ittifakı teklif etme
// ================================================================
allianceBtn.addEventListener("click", async () => {
  if (!myProvinceId || !selectedProvinceId || allianceBtn.disabled) return;
  const res = await proposeProvinceAlliance(myProvinceId, selectedProvinceId, myUid, myName);
  if (res.ok) showToast(`İttifak teklifi gönderildi: ${PROVINCE_NAMES[selectedProvinceId]}`, "🤝");
  else if (res.reason === "exists") showToast("Zaten bir teklif var ya da ittifaklısınız.", "🤝");
});

// ================================================================
// EK: Meydan okuma (challenge) gönderme butonları
// ================================================================
for (const g of GAME_TYPES) {
  const btn = document.createElement("button");
  btn.className = "challenge-game-btn";
  btn.innerHTML = `<span class="g-emoji">${g.emoji}</span><span>${g.label}</span>`;
  btn.addEventListener("click", () => onSendChallenge(g.id));
  challengeGames.appendChild(btn);
}

async function onSendChallenge(gameType) {
  if (!myUid || !myProvinceId || !selectedProvinceId) return;
  if (myProvinceId === selectedProvinceId) return;
  if (!canChallengeNow()) {
    showToast(`Biraz bekle: ${Math.ceil(challengeCooldownRemaining() / 1000)}sn`, "⏳");
    return;
  }
  const res = await sendChallenge({ fromProvinceId: myProvinceId, toProvinceId: selectedProvinceId, uid: myUid, name: myName, gameType });
  if (res.ok) showToast(`Meydan okuma gönderildi: ${PROVINCE_NAMES[selectedProvinceId]}`, "⚔️");
}

// Bana (ilime) gelen bekleyen meydan okuma / ittifak tekliflerini dinle.
function rebindProvinceScopedListeners(pid) {
  if (pid === lastBoundProvinceId) return;
  lastBoundProvinceId = pid;
  if (unsubIncomingChallenges) unsubIncomingChallenges();
  if (unsubIncomingAlliance) unsubIncomingAlliance();
  if (!pid) return;

  unsubIncomingChallenges = listenIncomingChallenges(pid, (list) => {
    for (const c of list) {
      queueOffer({
        kind: "challenge",
        id: c.id,
        data: c,
        text: `${gameTypeMeta(c.gameType).emoji} ${c.fromName} (${PROVINCE_NAMES[c.fromProvinceId]}) size meydan okudu: ${gameTypeMeta(c.gameType).label}`,
      });
    }
  });

  unsubIncomingAlliance = listenIncomingAllianceOffers(pid, (list) => {
    for (const a of list) {
      queueOffer({
        kind: "alliance",
        id: a.id,
        data: a,
        text: `🤝 ${PROVINCE_NAMES[a.fromProvinceId]} ili, ${PROVINCE_NAMES[a.toProvinceId]} ile ittifak teklif ediyor.`,
      });
    }
  });
}

function queueOffer(offer) {
  if (seenOfferIds.has(offer.id)) return;
  seenOfferIds.add(offer.id);
  offerQueue.push(offer);
  if (!activeOffer) showNextOffer();
}

function showNextOffer() {
  activeOffer = offerQueue.shift() || null;
  if (!activeOffer) {
    offerBanner.classList.add("hidden");
    return;
  }
  offerText.textContent = activeOffer.text;
  offerBanner.classList.remove("hidden");
}

offerAccept.addEventListener("click", async () => {
  if (!activeOffer) return;
  const o = activeOffer;
  offerBanner.classList.add("hidden");
  try {
    if (o.kind === "challenge") {
      const data = await acceptChallenge(o.id, myUid, myName);
      openMinigame(o.id, data);
    } else if (o.kind === "alliance") {
      await acceptProvinceAlliance(o.id, o.data.fromProvinceId, o.data.toProvinceId);
      showToast("İttifak kuruldu!", "🤝");
    }
  } catch (e) {
    showToast("Bu teklif artık geçerli değil.", "⚠️");
  }
  activeOffer = null;
  showNextOffer();
});

offerDecline.addEventListener("click", () => {
  if (!activeOffer) return;
  const o = activeOffer;
  offerBanner.classList.add("hidden");
  if (o.kind === "challenge") declineChallenge(o.id);
  else declineProvinceAlliance(o.id);
  activeOffer = null;
  showNextOffer();
});

// ================================================================
// EK: Mini oyun modalı
// ================================================================
function bindMyChallenges() {
  listenMyChallenges(myUid, (list) => {
    for (const c of list) {
      if (c.status === "accepted" && currentChallengeId !== c.id) {
        openMinigame(c.id, c);
      } else if (c.status === "finished" && c.id === currentChallengeId) {
        showMinigameResult(c);
      }
    }
  });
}

function openMinigame(challengeId, data) {
  currentChallengeId = challengeId;
  minigameModal.classList.remove("hidden");
  const meta = gameTypeMeta(data.gameType);
  minigameTitle.textContent = `${meta.emoji} ${meta.label}`;
  minigameSub.textContent = `${data.fromName || "?"} (${PROVINCE_NAMES[data.fromProvinceId]}) vs ${data.toName || "?"} (${PROVINCE_NAMES[data.toProvinceId]})`;
  minigameContent.innerHTML = "";

  if (data.gameType === "rps" || data.gameType === "emoji") {
    renderChoiceGame(data);
  } else if (data.gameType === "click") {
    renderClickGame();
  } else if (data.gameType === "trivia") {
    renderTriviaGame();
  }

  logEvent(`${meta.emoji} ${PROVINCE_NAMES[data.toProvinceId]}, meydan okumayı kabul etti!`, meta.emoji);
}

function renderChoiceGame(data) {
  const options = data.gameType === "emoji" ? EMOJI_OPTIONS : RPS_OPTIONS;
  const wrap = document.createElement("div");
  wrap.className = "minigame-options";
  const status = document.createElement("div");
  status.className = "minigame-status";
  status.textContent = "Bir seçim yap!";

  for (const opt of options) {
    const btn = document.createElement("button");
    btn.className = "minigame-option-btn";
    btn.textContent = opt.emoji;
    btn.title = opt.label;
    btn.addEventListener("click", () => {
      wrap.querySelectorAll("button").forEach((b) => { b.classList.remove("chosen"); b.disabled = true; });
      btn.classList.add("chosen");
      submitChoice(currentChallengeId, myUid, opt.id);
      status.textContent = "Seçimin kaydedildi, rakip bekleniyor…";
    });
    wrap.appendChild(btn);
  }
  minigameContent.appendChild(wrap);
  minigameContent.appendChild(status);
}

function renderClickGame() {
  const btn = document.createElement("button");
  btn.className = "click-target";
  btn.textContent = "TIKLA! ⚡";
  btn.addEventListener("click", () => {
    btn.disabled = true;
    btn.textContent = "Gönderildi, bekleniyor…";
    submitClick(currentChallengeId, myUid);
  });
  const status = document.createElement("div");
  status.className = "minigame-status";
  status.textContent = "Hazır olduğunda tıkla, ilk tıklayan kazanır!";
  minigameContent.appendChild(btn);
  minigameContent.appendChild(status);
}

function renderTriviaGame() {
  const q = pickTriviaQuestion(currentChallengeId);
  const qEl = document.createElement("div");
  qEl.className = "trivia-q";
  qEl.textContent = q.q;
  minigameContent.appendChild(qEl);

  const optsWrap = document.createElement("div");
  optsWrap.className = "trivia-options";
  const status = document.createElement("div");
  status.className = "minigame-status";
  status.textContent = "İlk doğru cevap kazanır!";

  q.options.forEach((optText, idx) => {
    const btn = document.createElement("button");
    btn.className = "trivia-option-btn";
    btn.textContent = optText;
    btn.addEventListener("click", () => {
      optsWrap.querySelectorAll("button").forEach((b) => { b.disabled = true; });
      const isCorrect = idx === q.correct;
      btn.classList.add(isCorrect ? "correct" : "wrong");
      submitTriviaAnswer(currentChallengeId, myUid, isCorrect);
      status.textContent = isCorrect ? "Doğru! Sonuç bekleniyor…" : "Yanlış cevap, rakibin şansı sürüyor…";
    });
    optsWrap.appendChild(btn);
  });
  minigameContent.appendChild(optsWrap);
  minigameContent.appendChild(status);
}

function showMinigameResult(data) {
  const amA = myUid === data.fromUid;
  let outcome;
  if (!data.winnerSide) outcome = "draw";
  else outcome = (data.winnerSide === "a") === amA ? "win" : "lose";

  minigameContent.innerHTML = "";
  const res = document.createElement("div");
  res.className = `minigame-result ${outcome}`;
  res.textContent = outcome === "win" ? "🏆 Kazandın! Desteğiniz arttı." : outcome === "lose" ? "😢 Kaybettin." : "🤝 Berabere!";
  minigameContent.appendChild(res);

  const closeBtn = document.createElement("button");
  closeBtn.className = "btn btn-teal btn-block modal-close-btn";
  closeBtn.textContent = "Kapat";
  closeBtn.addEventListener("click", () => {
    minigameModal.classList.add("hidden");
    currentChallengeId = null;
  });
  minigameContent.appendChild(closeBtn);

  showBigBanner(outcome === "draw" ? "BERABERE!" : outcome === "win" ? "KAZANDIN! 🏆" : "KAYBETTİN 😢");
}

// ================================================================
// EK: Hazırım / Final animasyonu
// ================================================================
function renderReadyBtn() {
  readyBtn.classList.toggle("is-ready", amReady);
  readyLabel.textContent = amReady ? "Hazırsın!" : "Hazırım";
}

readyBtn.addEventListener("click", () => {
  if (!myUid) return;
  amReady = !amReady;
  renderReadyBtn();
  setReady(myUid, amReady);
});

function bindReadinessAndFinale() {
  listenReadiness(({ readyCount, total }) => {
    readyCountEl.textContent = `${readyCount}/${total}`;
    checkAndTriggerFinale(readyCount, total);
  });
  listenFinale(() => playFinaleAnimation());
}

let finalePlaying = false;
function playFinaleAnimation() {
  if (finalePlaying) return;
  finalePlaying = true;
  finaleOverlay.classList.remove("hidden");
  finaleText.classList.add("hidden");
  finaleParticles.innerHTML = "";
  finaleCountdown.style.display = "block";

  let n = 3;
  finaleCountdown.textContent = String(n);
  const tick = setInterval(() => {
    n--;
    if (n > 0) {
      finaleCountdown.textContent = String(n);
      finaleCountdown.style.animation = "none";
      void finaleCountdown.offsetWidth;
      finaleCountdown.style.animation = "";
    } else {
      clearInterval(tick);
      finaleCountdown.style.display = "none";
      finaleText.classList.remove("hidden");
      launchConfetti();
      launchRays();
      document.querySelectorAll(".province").forEach((el) => el.classList.add("finale-glow"));
      setTimeout(() => {
        document.querySelectorAll(".province").forEach((el) => el.classList.remove("finale-glow"));
      }, 5000);
      setTimeout(() => { finalePlaying = false; }, 6000);
    }
  }, 900);
}

function launchConfetti() {
  const colors = ["#2fe6c4", "#ffc542", "#ff5a63", "#74c0fc", "#f783ac"];
  for (let i = 0; i < 90; i++) {
    const piece = document.createElement("div");
    piece.className = "confetti-piece";
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[i % colors.length];
    piece.style.animationDuration = `${2.2 + Math.random() * 1.6}s`;
    piece.style.animationDelay = `${Math.random() * 0.6}s`;
    finaleParticles.appendChild(piece);
    setTimeout(() => piece.remove(), 5200);
  }
}

function launchRays() {
  for (let i = 0; i < 10; i++) {
    const ray = document.createElement("div");
    ray.className = "finale-ray";
    ray.style.transform = `translate(-50%, -50%) rotate(${(360 / 10) * i}deg)`;
    ray.style.animationDelay = `${Math.random() * 0.3}s`;
    finaleParticles.appendChild(ray);
    setTimeout(() => ray.remove(), 2200);
  }
}

finaleOverlay.addEventListener("click", () => finaleOverlay.classList.add("hidden"));
