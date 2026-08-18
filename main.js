// main.js — oyunun giriş noktası
import { auth, db, onAuthStateChanged, signInAnonymously, updateProfile } from "./firebase-config.js";
import {
  doc, setDoc, getDoc, collection, onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { initMap, setProvinceState, flashProvince } from "./map.js";
import { PROVINCE_NAMES, getNeighbors, areNeighbors, BUILDINGS } from "./provinces-data.js";
import { getDisplayResources, claimProvince, upgradeBuilding, flushProvince } from "./economy.js";
import { attackProvince, tickOccupation } from "./war.js";
import { sendMessage, listenMessages } from "./chat.js";
import { pushNotification, listenNotifications, markRead, showToast } from "./notifications.js";
import { computeLeaderboard } from "./leaderboard.js";
import {
  createAlliance, sendAllianceInvite, acceptAllianceInvite, declineAllianceInvite,
  leaveAlliance, listenMyInvites, listenAlliance, areAllied,
} from "./alliance.js";

// ---------- Durum ----------
let currentUser = null;   // { uid, username }
let myAllianceId = null;
let provincesCache = {};  // id -> data
let selectedProvinceId = null;
let firstNotifBatch = true;
let unsubProvinces = null;

// ---------- DOM kısayolları ----------
const $ = (id) => document.getElementById(id);
const loginScreen = $("login-screen");
const gameScreen = $("game-screen");

// ==================================================
// GİRİŞ
// ==================================================
$("login-btn").addEventListener("click", handleLogin);
$("username-input").addEventListener("keydown", (e) => { if (e.key === "Enter") handleLogin(); });

async function handleLogin() {
  const name = $("username-input").value.trim();
  const errEl = $("login-error");
  errEl.textContent = "";
  if (name.length < 2) { errEl.textContent = "Kullanıcı adı en az 2 karakter olmalı."; return; }

  $("login-btn").disabled = true;
  try {
    const cred = await signInAnonymously(auth);
    await updateProfile(cred.user, { displayName: name });
    await setDoc(doc(db, "players", cred.user.uid), {
      uid: cred.user.uid,
      username: name,
      createdAt: Date.now(),
      allianceId: null,
    }, { merge: true });
  } catch (e) {
    errEl.textContent = "Giriş başarısız: " + e.message;
    $("login-btn").disabled = false;
  }
}

onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  const playerSnap = await getDoc(doc(db, "players", user.uid));
  const username = playerSnap.exists() ? playerSnap.data().username : (user.displayName || "Oyuncu");
  myAllianceId = playerSnap.exists() ? playerSnap.data().allianceId : null;
  currentUser = { uid: user.uid, username };

  loginScreen.classList.add("hidden");
  gameScreen.classList.remove("hidden");
  $("player-name").textContent = username;

  await boot();
});

// ==================================================
// BOOT
// ==================================================
async function boot() {
  try {
    await initMap($("map-svg"), onProvinceClick);
    $("map-loading").classList.add("hidden");
  } catch (e) {
    $("map-loading").textContent = "Harita yüklenemedi. Bağlantınızı kontrol edin.";
    console.error(e);
    return;
  }

  subscribeProvinces();
  subscribeNotifications();
  subscribeChat();
  subscribeAllianceInvites();
  if (myAllianceId) subscribeMyAlliance();
}

// ==================================================
// HARİTA / İL VERİSİ
// ==================================================
function subscribeProvinces() {
  if (unsubProvinces) unsubProvinces();
  unsubProvinces = onSnapshot(collection(db, "provinces"), (snap) => {
    snap.docChanges().forEach((change) => {
      const id = Number(change.doc.id);
      const data = change.doc.data();
      provincesCache[id] = data;
      recolorProvince(id, data);
      if (change.type === "modified") flashProvince(id);
    });
    if (selectedProvinceId != null) renderProvincePanel(selectedProvinceId);
  });
}

function recolorProvince(id, data) {
  if (!data || !data.ownerUid) { setProvinceState(id, "neutral"); return; }
  if (data.ownerUid === currentUser.uid) {
    setProvinceState(id, data.status === "occupied" ? "occupied" : "owned");
    return;
  }
  if (myAllianceId && data.ownerAllianceId === myAllianceId) {
    setProvinceState(id, "ally");
    return;
  }
  setProvinceState(id, "enemy");
}

function onProvinceClick(id) {
  selectedProvinceId = id;
  renderProvincePanel(id);
  openPanel("province-panel");
}

// ==================================================
// İL PANELİ
// ==================================================
function renderProvincePanel(id) {
  const data = provincesCache[id] || { status: "neutral" };
  const name = PROVINCE_NAMES[id] || "?";
  $("pp-name").textContent = name;

  const isMine = data.ownerUid === currentUser.uid;
  const isNeutral = !data.ownerUid;
  const isNeighbor = areNeighbors(getOwnedProvinceNear(id), id);

  let statusText = "Tarafsız il";
  if (data.ownerUid) {
    statusText = `${isMine ? "Sizin iliniz" : data.ownerName + " iline ait"}`;
    if (data.status === "occupied") statusText += " · İŞGAL ALTINDA";
  }
  $("pp-status").textContent = statusText;

  // Kaynaklar
  const res = isNeutral ? { gold: 0, food: 0, iron: 0, soldiers: 0, defense: 0 } : getDisplayResources(data);
  const resGrid = $("pp-resources");
  resGrid.innerHTML = "";
  const resourceLabels = { gold: "💰 Altın", food: "🌾 Gıda", iron: "⛏️ Demir", soldiers: "🪖 Asker", defense: "🛡️ Savunma" };
  for (const [key, label] of Object.entries(resourceLabels)) {
    const div = document.createElement("div");
    div.innerHTML = `${label}<b>${Math.floor(res[key] || 0)}</b>`;
    resGrid.appendChild(div);
  }

  // Binalar (sadece kendi ilinde)
  const buildingsWrap = $("pp-buildings");
  buildingsWrap.innerHTML = "";
  if (isMine && data.status !== "occupied") {
    for (const b of Object.values(BUILDINGS)) {
      const level = (data.buildings && data.buildings[b.key]) || 0;
      const row = document.createElement("div");
      row.className = "building-row";
      row.innerHTML = `<span>${b.label} · Sev. ${level}</span>`;
      const btn = document.createElement("button");
      btn.textContent = "Yükselt";
      btn.addEventListener("click", () => doUpgrade(id, b.key));
      row.appendChild(btn);
      buildingsWrap.appendChild(row);
    }
  }

  // Eylemler
  const actions = $("pp-actions");
  actions.innerHTML = "";

  if (isNeutral) {
    const hasAdjacentOwned = getNeighbors(id).some((nid) => provincesCache[nid]?.ownerUid === currentUser.uid);
    const anyOwned = Object.values(provincesCache).some((p) => p.ownerUid === currentUser.uid);
    const canClaim = !anyOwned || hasAdjacentOwned;
    const btn = document.createElement("button");
    btn.textContent = anyOwned ? "Bu ile Yerleş (komşu olmalı)" : "Bu İli Başlangıç İli Yap";
    btn.disabled = !canClaim;
    btn.addEventListener("click", () => doClaim(id));
    actions.appendChild(btn);
  } else if (!isMine) {
    const myNeighborProvince = getNeighbors(id).find((nid) => provincesCache[nid]?.ownerUid === currentUser.uid);
    const btn = document.createElement("button");
    btn.textContent = "⚔️ Saldır";
    btn.disabled = !myNeighborProvince;
    btn.title = myNeighborProvince ? "" : "Saldırmak için komşu bir iliniz olmalı";
    btn.addEventListener("click", () => doAttack(myNeighborProvince, id));
    actions.appendChild(btn);
  } else {
    const info = document.createElement("p");
    info.style.fontSize = "12px";
    info.style.color = "var(--muted)";
    info.textContent = data.status === "occupied"
      ? "İşgal altında: huzursuzluk zamanla düşecek, sonra tam entegre olacak."
      : "Kaynaklarınızı geliştirin ve komşu illere yayılın.";
    actions.appendChild(info);
    if (data.status === "occupied") tickOccupation(id).catch(() => {});
  }
}

function getOwnedProvinceNear(id) {
  // yardımcı: sadece panel metni için, gerçek saldırı kontrolü ayrı yapılır
  return id;
}

async function doClaim(id) {
  try {
    await claimProvince(id, currentUser.uid, currentUser.username);
    showToast("info", `${PROVINCE_NAMES[id]} ilini aldınız!`);
  } catch (e) {
    showToast("info", e.message);
  }
}

async function doUpgrade(id, buildingKey) {
  try {
    await upgradeBuilding(id, buildingKey, currentUser.uid);
    showToast("resource", `${BUILDINGS[buildingKey].label} geliştirildi.`);
    renderProvincePanel(id);
  } catch (e) {
    showToast("info", e.message);
  }
}

async function doAttack(fromId, toId) {
  try {
    const result = await attackProvince(fromId, toId, currentUser.uid, currentUser.username);
    if (result.outcome === "conquered") showToast("conquest", `${PROVINCE_NAMES[toId]} ilini fethettiniz! 🏆`);
    else if (result.outcome === "attacker_advantage") showToast("attack", "Saldırı başarılı, savunma zayıfladı.");
    else showToast("attack", "Saldırı püskürtüldü.");
    renderProvincePanel(toId);
  } catch (e) {
    showToast("info", e.message);
  }
}

// ==================================================
// PANEL AÇMA/KAPAMA
// ==================================================
function openPanel(id) {
  document.querySelectorAll(".panel").forEach((p) => p.classList.add("hidden"));
  $(id).classList.remove("hidden");
}
document.querySelectorAll("[data-close]").forEach((btn) => {
  btn.addEventListener("click", () => $(btn.dataset.close).classList.add("hidden"));
});

$("leaderboard-btn").addEventListener("click", async () => {
  openPanel("leaderboard-panel");
  const rows = await computeLeaderboard();
  const body = $("leaderboard-body");
  body.innerHTML = rows.map((r, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${r.name}${r.uid === currentUser.uid ? " (Siz)" : ""}</td>
      <td>${r.provinces}</td>
      <td>${Math.floor(r.soldiers)}</td>
      <td>${Math.floor(r.score)}</td>
    </tr>`).join("");
});

$("notif-btn").addEventListener("click", () => openPanel("notif-panel"));
$("chat-toggle-btn").addEventListener("click", () => openPanel("chat-panel"));
$("chat-toggle-mobile").addEventListener("click", () => openPanel("chat-panel"));

// ==================================================
// SOHBET
// ==================================================
function subscribeChat() {
  listenMessages((messages) => {
    const wrap = $("chat-messages");
    wrap.innerHTML = messages.map((m) => `
      <div class="chat-msg ${m.uid === currentUser.uid ? "mine" : ""}">
        <span class="who">${m.username}</span>${escapeHtml(m.text)}
      </div>`).join("");
    wrap.scrollTop = wrap.scrollHeight;
  });
}
$("chat-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = $("chat-input");
  if (!input.value.trim()) return;
  sendMessage(currentUser.uid, currentUser.username, input.value);
  input.value = "";
});

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ==================================================
// BİLDİRİMLER
// ==================================================
function subscribeNotifications() {
  listenNotifications(currentUser.uid, (items) => {
    const unread = items.filter((i) => !i.read);
    $("notif-dot").classList.toggle("hidden", unread.length === 0);

    $("notif-list").innerHTML = items.map((i) => `
      <div class="notif-item ${i.read ? "" : "unread"}" data-id="${i.id}">${escapeHtml(i.text)}</div>
    `).join("") || `<p style="color:var(--muted);font-size:13px;">Henüz bildirim yok.</p>`;

    document.querySelectorAll("#notif-list .notif-item").forEach((el) => {
      el.addEventListener("click", () => markRead(currentUser.uid, el.dataset.id));
    });

    if (!firstNotifBatch) {
      const newest = items[0];
      if (newest && !newest.read) showToast(newest.type, newest.text);
    }
    firstNotifBatch = false;
  });
}

// ==================================================
// İTTİFAK
// ==================================================
function subscribeAllianceInvites() {
  listenMyInvites(currentUser.uid, (invites) => renderAlliancePanel(invites, null));
}
function subscribeMyAlliance() {
  listenAlliance(myAllianceId, (alliance) => renderAlliancePanel(null, alliance));
}

let lastInvites = [];
let lastAlliance = null;
function renderAlliancePanel(invites, alliance) {
  if (invites) lastInvites = invites;
  if (alliance !== null) lastAlliance = alliance;
  const body = $("alliance-body");

  if (!myAllianceId) {
    body.innerHTML = `
      <input id="alliance-name-input" type="text" maxlength="24" placeholder="İttifak adı" style="width:100%;padding:10px;border:1px solid var(--line);border-radius:8px;margin-bottom:10px;" />
      <button id="create-alliance-btn" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--ink);background:var(--ink);color:#fff;cursor:pointer;">İttifak Kur</button>
      <h3 style="margin-top:20px;font-size:14px;">Davetler</h3>
      <div>${lastInvites.map((inv) => `
        <div class="notif-item" style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <span>${escapeHtml(inv.allianceName)}</span>
          <span>
            <button data-accept="${inv.id}" data-alliance="${inv.allianceId}">Kabul</button>
            <button data-decline="${inv.id}">Reddet</button>
          </span>
        </div>`).join("") || "<p style='color:var(--muted);font-size:13px;'>Davet yok.</p>"}</div>
    `;
    $("create-alliance-btn")?.addEventListener("click", async () => {
      const name = $("alliance-name-input").value.trim();
      if (!name) return;
      myAllianceId = await createAlliance(name, currentUser.uid, currentUser.username);
      subscribeMyAlliance();
    });
    body.querySelectorAll("[data-accept]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await acceptAllianceInvite(btn.dataset.accept, btn.dataset.alliance, currentUser.uid, currentUser.username);
        myAllianceId = btn.dataset.alliance;
        subscribeMyAlliance();
      });
    });
    body.querySelectorAll("[data-decline]").forEach((btn) => {
      btn.addEventListener("click", () => declineAllianceInvite(btn.dataset.decline));
    });
  } else {
    const members = lastAlliance ? Object.values(lastAlliance.memberNames || {}) : [];
    body.innerHTML = `
      <p><b>${lastAlliance ? escapeHtml(lastAlliance.name) : "…"}</b></p>
      <p style="font-size:13px;color:var(--muted);">Üyeler: ${members.map(escapeHtml).join(", ") || "…"}</p>
      <button id="leave-alliance-btn" style="margin-top:10px;padding:8px 12px;border-radius:8px;border:1px solid var(--enemy);color:var(--enemy);background:none;cursor:pointer;">İttifaktan Ayrıl</button>
    `;
    $("leave-alliance-btn")?.addEventListener("click", async () => {
      await leaveAlliance(myAllianceId, currentUser.uid);
      myAllianceId = null;
      renderAlliancePanel(lastInvites, null);
    });
  }
}

// Menüye ittifak butonu ekle (topbar'a dinamik)
window.addEventListener("DOMContentLoaded", () => {
  const btn = document.createElement("button");
  btn.className = "icon-btn";
  btn.title = "İttifak";
  btn.textContent = "🤝";
  btn.addEventListener("click", () => openPanel("alliance-panel"));
  $("chat-toggle-btn").insertAdjacentElement("beforebegin", btn);
});
