// map.js
// Türkiye haritasını GERÇEK GeoJSON verisinden oluşturur.
// Kaynak: alpers/Turkey-Maps-GeoJSON (jsDelivr CDN üzerinden, tarayıcıda çekilir).
// Harita SADECE BİR KEZ oluşturulur; sonrasında yalnızca renk/sınıf güncellenir.

import { PROVINCE_NAMES, NAME_TO_ID, normalizeName } from "./provinces-data.js";

const GEOJSON_URL =
  "https://cdn.jsdelivr.net/gh/alpers/Turkey-Maps-GeoJSON@master/tr-cities.json";
const GEOJSON_FALLBACK_URL =
  "https://raw.githubusercontent.com/alpers/Turkey-Maps-GeoJSON/master/tr-cities.json";

const SVG_NS = "http://www.w3.org/2000/svg";
const VIEW_W = 1000;
const VIEW_H = 480;

let svgEl = null;
let pathById = {};
let onProvinceClick = null;
let projection = null;

/** Basit eşdikdörtgen (equirectangular) izdüşüm, enlem düzeltmeli. */
function buildProjection(bounds) {
  const { minLon, maxLon, minLat, maxLat } = bounds;
  const midLat = (minLat + maxLat) / 2;
  const cosLat = Math.cos((midLat * Math.PI) / 180);

  const lonSpan = (maxLon - minLon) * cosLat;
  const latSpan = maxLat - minLat;

  const padding = 20;
  const scaleX = (VIEW_W - padding * 2) / lonSpan;
  const scaleY = (VIEW_H - padding * 2) / latSpan;
  const scale = Math.min(scaleX, scaleY);

  const offsetX = padding + (VIEW_W - padding * 2 - lonSpan * scale) / 2;
  const offsetY = padding + (VIEW_H - padding * 2 - latSpan * scale) / 2;

  return function project([lon, lat]) {
    const x = (lon - minLon) * cosLat * scale + offsetX;
    const y = (maxLat - lat) * scale + offsetY; // ekran Y'si ters
    return [x, y];
  };
}

function computeBounds(features) {
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  const walk = (coords, depth) => {
    if (depth === 0) {
      const [lon, lat] = coords;
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    } else {
      for (const c of coords) walk(c, depth - 1);
    }
  };
  for (const f of features) {
    const depth = f.geometry.type === "Polygon" ? 2 : 3;
    walk(f.geometry.coordinates, depth);
  }
  return { minLon, maxLon, minLat, maxLat };
}

function ringToPath(ring, project) {
  let d = "";
  ring.forEach((pt, i) => {
    const [x, y] = project(pt);
    d += (i === 0 ? "M" : "L") + x.toFixed(2) + "," + y.toFixed(2);
  });
  d += "Z";
  return d;
}

function geometryToPath(geometry, project) {
  if (geometry.type === "Polygon") {
    return geometry.coordinates.map((ring) => ringToPath(ring, project)).join(" ");
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates
      .map((poly) => poly.map((ring) => ringToPath(ring, project)).join(" "))
      .join(" ");
  }
  return "";
}

function resolveProvinceId(props) {
  if (typeof props.number === "number" && PROVINCE_NAMES[props.number]) {
    return props.number;
  }
  const key = normalizeName(props.name || "");
  return NAME_TO_ID[key] || null;
}

async function fetchGeoJSON() {
  for (const url of [GEOJSON_URL, GEOJSON_FALLBACK_URL]) {
    try {
      const res = await fetch(url, { cache: "force-cache" });
      if (!res.ok) continue;
      return await res.json();
    } catch (e) {
      console.warn("Harita verisi alınamadı, sıradaki kaynak deneniyor:", url, e);
    }
  }
  throw new Error("Harita verisi hiçbir kaynaktan alınamadı.");
}

/**
 * Haritayı bir kez oluşturur.
 * @param {SVGSVGElement} svg - içine çizilecek <svg> elemanı
 * @param {(provinceId:number)=>void} clickHandler
 */
export async function initMap(svg, clickHandler) {
  svgEl = svg;
  onProvinceClick = clickHandler;
  svgEl.setAttribute("viewBox", `0 0 ${VIEW_W} ${VIEW_H}`);

  const geo = await fetchGeoJSON();
  const bounds = computeBounds(geo.features);
  projection = buildProjection(bounds);

  const group = document.createElementNS(SVG_NS, "g");
  group.setAttribute("id", "provinces-layer");

  for (const feature of geo.features) {
    const id = resolveProvinceId(feature.properties);
    if (!id) continue;
    const d = geometryToPath(feature.geometry, projection);
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    path.setAttribute("class", "province neutral");
    path.setAttribute("data-id", String(id));
    path.setAttribute("data-name", PROVINCE_NAMES[id] || feature.properties.name);
    path.addEventListener("click", () => onProvinceClick && onProvinceClick(id));
    group.appendChild(path);
    pathById[id] = path;
  }

  svgEl.appendChild(group);
  setupPanZoom(svgEl, group);
  return { provinceCount: Object.keys(pathById).length };
}

/** Bir ilin görsel durumunu günceller (sadece o ilin class'ı değişir). */
export function setProvinceState(provinceId, state) {
  const el = pathById[provinceId];
  if (!el) return;
  el.setAttribute("class", `province ${state}`);
}

export function flashProvince(provinceId) {
  const el = pathById[provinceId];
  if (!el) return;
  el.classList.add("flash");
  setTimeout(() => el.classList.remove("flash"), 900);
}

export function getProvincePath(provinceId) {
  return pathById[provinceId] || null;
}

/** Bir ili istenen renkle boyar (ele geçirilmiş il rengi) ya da renk temizler. */
export function setProvinceColor(provinceId, color) {
  const el = pathById[provinceId];
  if (!el) return;
  if (color) {
    el.style.fill = color;
    el.style.color = color; // currentColor tabanlı glow efekti için
    el.classList.add("captured");
  } else {
    el.style.fill = "";
    el.style.color = "";
    el.classList.remove("captured");
  }
}

/** İlin ekran (viewport) koordinatlarındaki merkezini döndürür; overlay/animasyon konumlamak için. */
export function getProvinceScreenCenter(provinceId) {
  const el = pathById[provinceId];
  if (!el || !svgEl) return null;
  const bbox = el.getBBox();
  const pt = svgEl.createSVGPoint();
  pt.x = bbox.x + bbox.width / 2;
  pt.y = bbox.y + bbox.height / 2;
  const ctm = el.getScreenCTM();
  if (!ctm) return null;
  const screenPt = pt.matrixTransform(ctm);
  return { x: screenPt.x, y: screenPt.y };
}

// --- Basit sürükle / tekerlek ile zoom (ağır kütüphane yok) ---
function setupPanZoom(svg, group) {
  let scale = 1, tx = 0, ty = 0;
  let dragging = false, lastX = 0, lastY = 0;

  function apply() {
    group.setAttribute("transform", `translate(${tx},${ty}) scale(${scale})`);
  }

  function pointerDown(x, y) {
    dragging = true;
    lastX = x; lastY = y;
  }
  function pointerMove(x, y) {
    if (!dragging) return;
    tx += (x - lastX);
    ty += (y - lastY);
    lastX = x; lastY = y;
    apply();
  }
  function pointerUp() { dragging = false; }

  svg.addEventListener("mousedown", (e) => pointerDown(e.clientX, e.clientY));
  window.addEventListener("mousemove", (e) => pointerMove(e.clientX, e.clientY));
  window.addEventListener("mouseup", pointerUp);

  svg.addEventListener("touchstart", (e) => {
    if (e.touches.length === 1) pointerDown(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });
  svg.addEventListener("touchmove", (e) => {
    if (e.touches.length === 1) pointerMove(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });
  svg.addEventListener("touchend", pointerUp);

  svg.addEventListener("wheel", (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    scale = Math.min(6, Math.max(0.6, scale * delta));
    apply();
  }, { passive: false });
}
