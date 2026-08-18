// notifications.js
// Küçük toast bildirimleri ve "İL ELE GEÇİRİLDİ!" gibi büyük, kısa süreli banner.

export function showToast(text, emoji = "🔔") {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `<span class="toast-emoji">${emoji}</span><span>${text}</span>`;
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 300);
  }, 3600);
}

export function showBigBanner(text, sub = "") {
  const container = document.getElementById("banner-container");
  if (!container) return;
  const el = document.createElement("div");
  el.className = "big-banner";
  el.innerHTML = `<div class="big-banner-title">${text}</div>${sub ? `<div class="big-banner-sub">${sub}</div>` : ""}`;
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 400);
  }, 2600);
}
