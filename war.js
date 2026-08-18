// war.js
// Savaş Gücü = Asker × Moral × Kalite × Savunma/Komutan Bonusu
// Sonuca 0.85 - 1.15 arası rastgele katsayı eklenir.
// Kazanan taraf karşı tarafın askerlerini azaltır.
// Savunma tamamen kırılırsa il saldıran oyuncuya geçer (İŞGAL durumuna).

import {
  doc, runTransaction, serverTimestamp, addDoc, collection,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase-config.js";
import { areNeighbors } from "./provinces-data.js";
import { computeAccrued } from "./economy.js";
import { pushNotification } from "./notifications.js";

const MORALE_DEFAULT = 1.0;
const QUALITY_DEFAULT = 1.0;

function randomCoefficient() {
  return 0.85 + Math.random() * 0.3; // 0.85 - 1.15
}

function combatPower(soldiers, { morale = MORALE_DEFAULT, quality = QUALITY_DEFAULT, bonus = 1 } = {}) {
  return soldiers * morale * quality * bonus;
}

/**
 * fromProvinceId (saldıranın ili) -> toProvinceId (hedef) saldırısı.
 * Yalnızca komşu illere saldırılabilir.
 */
export async function attackProvince(fromProvinceId, toProvinceId, attackerUid, attackerName) {
  if (!areNeighbors(fromProvinceId, toProvinceId)) {
    throw new Error("Sadece komşu illere saldırabilirsiniz.");
  }

  const fromRef = doc(db, "provinces", String(fromProvinceId));
  const toRef = doc(db, "provinces", String(toProvinceId));

  const result = await runTransaction(db, async (tx) => {
    const fromSnap = await tx.get(fromRef);
    const toSnap = await tx.get(toRef);
    if (!fromSnap.exists()) throw new Error("Saldıran il bulunamadı.");
    const fromData = fromSnap.data();
    if (fromData.ownerUid !== attackerUid) throw new Error("Bu il size ait değil.");

    const toData = toSnap.exists() ? toSnap.data() : { status: "neutral", soldiers: 15, defense: 5 };
    if (toData.ownerUid === attackerUid) throw new Error("Kendi ilinize saldıramazsınız.");

    const fromAccrued = computeAccrued(fromData);
    const toAccrued = computeAccrued(toData);

    const attackerSoldiers = (fromData.soldiers || 0) + fromAccrued.soldiers;
    const defenderSoldiers = (toData.soldiers || 0) + toAccrued.soldiers;
    const defenderDefenseLevel = (toData.buildings && toData.buildings.defense) || 0;
    const defenseBonus = 1 + defenderDefenseLevel * 0.08;

    const coeffAttacker = randomCoefficient();
    const coeffDefender = randomCoefficient();

    const attackPower = combatPower(attackerSoldiers, {}) * coeffAttacker;
    const defensePower = combatPower(defenderSoldiers, { bonus: defenseBonus }) * coeffDefender;

    const attackerWins = attackPower > defensePower;
    const powerRatio = attackPower / Math.max(1, defensePower);

    let outcome;
    if (attackerWins) {
      const remainingDefender = Math.max(0, defenderSoldiers - defenderSoldiers * Math.min(1, powerRatio - 1 + 0.3));
      const survivingAttacker = Math.max(0, attackerSoldiers - attackerSoldiers * 0.15);

      if (remainingDefender <= 0.5) {
        // Savunma tamamen kırıldı -> il el değiştirir, İŞGAL durumuna girer.
        tx.set(toRef, {
          ...toData,
          ownerUid: attackerUid,
          ownerName: attackerName,
          status: "occupied",
          unrest: 100,
          soldiers: Math.max(5, survivingAttacker * 0.3),
          defense: (toData.defense || 0) * 0.4,
          gold: (toData.gold || 0) + toAccrued.gold,
          food: (toData.food || 0) + toAccrued.food,
          iron: (toData.iron || 0) + toAccrued.iron,
          lastUpdate: serverTimestamp(),
        }, { merge: true });
        outcome = "conquered";
      } else {
        tx.update(toRef, {
          soldiers: remainingDefender,
          gold: (toData.gold || 0) + toAccrued.gold,
          food: (toData.food || 0) + toAccrued.food,
          iron: (toData.iron || 0) + toAccrued.iron,
          lastUpdate: serverTimestamp(),
        });
        outcome = "attacker_advantage";
      }

      tx.update(fromRef, {
        soldiers: survivingAttacker,
        gold: (fromData.gold || 0) + fromAccrued.gold,
        food: (fromData.food || 0) + fromAccrued.food,
        iron: (fromData.iron || 0) + fromAccrued.iron,
        lastUpdate: serverTimestamp(),
      });
    } else {
      const remainingAttacker = Math.max(0, attackerSoldiers - attackerSoldiers * Math.min(1, (1 / powerRatio) - 1 + 0.3));
      const survivingDefender = Math.max(0, defenderSoldiers - defenderSoldiers * 0.1);

      tx.update(fromRef, {
        soldiers: remainingAttacker,
        gold: (fromData.gold || 0) + fromAccrued.gold,
        food: (fromData.food || 0) + fromAccrued.food,
        iron: (fromData.iron || 0) + fromAccrued.iron,
        lastUpdate: serverTimestamp(),
      });
      if (toSnap.exists()) {
        tx.update(toRef, {
          soldiers: survivingDefender,
          gold: (toData.gold || 0) + toAccrued.gold,
          food: (toData.food || 0) + toAccrued.food,
          iron: (toData.iron || 0) + toAccrued.iron,
          lastUpdate: serverTimestamp(),
        });
      }
      outcome = "defender_wins";
    }

    return { outcome, defenderUid: toData.ownerUid || null, defenderName: toData.ownerName || null };
  });

  await addDoc(collection(db, "wars"), {
    attackerUid,
    attackerName,
    defenderUid: result.defenderUid,
    defenderName: result.defenderName,
    fromProvince: fromProvinceId,
    toProvince: toProvinceId,
    outcome: result.outcome,
    timestamp: serverTimestamp(),
  });

  if (result.defenderUid) {
    const text =
      result.outcome === "conquered"
        ? `⚔️ ${attackerName} ilinizi fethetti!`
        : `⚔️ ${attackerName} ilinize saldırdı.`;
    pushNotification(result.defenderUid, "attack", text);
  }
  if (result.outcome === "conquered") {
    pushNotification(attackerUid, "conquest", `🏆 Bir ili fethettiniz!`);
  }

  return result;
}

/**
 * İşgal altındaki illerde huzursuzluğu azaltır; sıfıra inince
 * il tam entegre edilir (status: "owned").
 * Bu fonksiyon periyodik olarak (ör. il paneli açıldığında) çağrılabilir.
 */
export async function tickOccupation(provinceId) {
  const ref = doc(db, "provinces", String(provinceId));
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const data = snap.data();
    if (data.status !== "occupied") return;

    const lastTick = data.lastUnrestTick ? data.lastUnrestTick.toMillis?.() ?? data.lastUnrestTick : Date.now();
    const elapsedMin = Math.max(0, (Date.now() - lastTick) / 60000);
    const decay = elapsedMin * 2; // dakikada ~2 puan huzursuzluk düşer
    const newUnrest = Math.max(0, (data.unrest || 100) - decay);

    tx.update(ref, {
      unrest: newUnrest,
      status: newUnrest <= 0 ? "owned" : "occupied",
      lastUnrestTick: serverTimestamp(),
    });
  });
}
