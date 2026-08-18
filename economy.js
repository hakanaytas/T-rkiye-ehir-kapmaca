// economy.js
// Kaynak üretimi "lastUpdate" zaman damgasına göre hesaplanır.
// Performans için her saniye Firestore'a yazmak yerine, kaynaklar
// EKRANDA anlık hesaplanır (client-side interpolation) ve sadece
// oyuncu bir eylem yaptığında (bina yükseltme, saldırı, il alma vb.)
// gerçek değer Firestore'a "flush" edilir. Bu, "lastUpdate'e göre
// geçen süreden üretim hesapla" kuralını korurken performansı da korur.

import {
  doc, getDoc, updateDoc, runTransaction, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase-config.js";
import { BUILDINGS, buildingCost } from "./provinces-data.js";

const PROD_PER_LEVEL = {
  farm: 1,
  mine: 0.8,
  market: 1.2,
  barracks: 0.4,
  defense: 0.5,
};

/** lastUpdate'ten bu yana geçen saniyeye göre üretilecek kaynakları döndürür. */
export function computeAccrued(province) {
  if (!province || !province.lastUpdate) return { gold: 0, food: 0, iron: 0, soldiers: 0, defense: 0 };
  const now = Date.now();
  const last = province.lastUpdate.toMillis ? province.lastUpdate.toMillis() : province.lastUpdate;
  const elapsedSec = Math.max(0, (now - last) / 1000);

  const buildings = province.buildings || {};
  const occupiedPenalty = province.status === "occupied" ? 0 : 1; // işgal altındaki il üretmez

  return {
    gold: (buildings.market || 0) * PROD_PER_LEVEL.market * elapsedSec * occupiedPenalty,
    food: (buildings.farm || 0) * PROD_PER_LEVEL.farm * elapsedSec * occupiedPenalty,
    iron: (buildings.mine || 0) * PROD_PER_LEVEL.mine * elapsedSec * occupiedPenalty,
    soldiers: (buildings.barracks || 0) * PROD_PER_LEVEL.barracks * elapsedSec * occupiedPenalty,
    defense: (buildings.defense || 0) * PROD_PER_LEVEL.defense * elapsedSec * occupiedPenalty,
  };
}

/** Görüntülenecek anlık (interpolated) kaynak değerlerini döndürür. */
export function getDisplayResources(province) {
  const accrued = computeAccrued(province);
  return {
    gold: (province.gold || 0) + accrued.gold,
    food: (province.food || 0) + accrued.food,
    iron: (province.iron || 0) + accrued.iron,
    soldiers: (province.soldiers || 0) + accrued.soldiers,
    defense: (province.defense || 0) + accrued.defense,
  };
}

/** Birikmiş üretimi Firestore'a yazar (lastUpdate'i şimdiye çeker). */
export async function flushProvince(provinceId, extraFields = {}) {
  const ref = doc(db, "provinces", String(provinceId));
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const data = snap.data();
    const accrued = computeAccrued(data);
    tx.update(ref, {
      gold: (data.gold || 0) + accrued.gold,
      food: (data.food || 0) + accrued.food,
      iron: (data.iron || 0) + accrued.iron,
      soldiers: (data.soldiers || 0) + accrued.soldiers,
      defense: (data.defense || 0) + accrued.defense,
      lastUpdate: serverTimestamp(),
      ...extraFields,
    });
  });
}

/** Boş (neutral) bir ili oyuncunun almasını sağlar. */
export async function claimProvince(provinceId, uid, username) {
  const ref = doc(db, "provinces", String(provinceId));
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists() ? snap.data() : {};
    if (data.ownerUid) throw new Error("Bu il zaten sahiplenilmiş.");
    tx.set(ref, {
      ...data,
      ownerUid: uid,
      ownerName: username,
      status: "owned",
      unrest: 0,
      gold: data.gold || 100,
      food: data.food || 100,
      iron: data.iron || 50,
      soldiers: data.soldiers || 20,
      defense: data.defense || 10,
      population: data.population || 1000,
      level: data.level || 1,
      buildings: data.buildings || { farm: 1, mine: 1, market: 1, barracks: 1, defense: 1 },
      lastUpdate: serverTimestamp(),
    }, { merge: true });
  });
}

/** Bir binayı bir seviye yükseltir (maliyeti kontrol ederek). */
export async function upgradeBuilding(provinceId, buildingKey, uid) {
  const ref = doc(db, "provinces", String(provinceId));
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("İl bulunamadı.");
    const data = snap.data();
    if (data.ownerUid !== uid) throw new Error("Bu il size ait değil.");
    if (data.status === "occupied") throw new Error("İşgal altındaki ilde geliştirme yapılamaz.");

    const accrued = computeAccrued(data);
    const currentLevel = (data.buildings && data.buildings[buildingKey]) || 0;
    const cost = buildingCost(buildingKey, currentLevel);

    const available = {
      gold: (data.gold || 0) + accrued.gold,
      food: (data.food || 0) + accrued.food,
      iron: (data.iron || 0) + accrued.iron,
    };
    for (const [res, amt] of Object.entries(cost)) {
      if ((available[res] || 0) < amt) throw new Error("Yetersiz kaynak.");
    }

    const newBuildings = { ...(data.buildings || {}) };
    newBuildings[buildingKey] = currentLevel + 1;

    tx.update(ref, {
      gold: available.gold - (cost.gold || 0),
      food: available.food - (cost.food || 0),
      iron: available.iron - (cost.iron || 0),
      soldiers: (data.soldiers || 0) + accrued.soldiers,
      defense: (data.defense || 0) + accrued.defense,
      buildings: newBuildings,
      level: (data.level || 1) + 1,
      lastUpdate: serverTimestamp(),
    });
  });
}

export async function getProvince(provinceId) {
  const snap = await getDoc(doc(db, "provinces", String(provinceId)));
  return snap.exists() ? { id: Number(provinceId), ...snap.data() } : { id: Number(provinceId), status: "neutral" };
}

export { BUILDINGS };
