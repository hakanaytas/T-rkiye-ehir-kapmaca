// leaderboard.js
// Puan = İl × 100 + Asker × 0.1 + Ekonomi Seviyesi × 50
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase-config.js";
import { computeAccrued } from "./economy.js";

export async function computeLeaderboard() {
  const q = query(collection(db, "provinces"), where("ownerUid", "!=", null));
  const snap = await getDocs(q);

  const byOwner = {};
  snap.forEach((d) => {
    const p = d.data();
    if (!p.ownerUid) return;
    const accrued = computeAccrued(p);
    const soldiers = (p.soldiers || 0) + accrued.soldiers;
    const economyLevel = p.level || 1;

    if (!byOwner[p.ownerUid]) {
      byOwner[p.ownerUid] = { uid: p.ownerUid, name: p.ownerName || "?", provinces: 0, soldiers: 0, economyLevel: 0 };
    }
    byOwner[p.ownerUid].provinces += 1;
    byOwner[p.ownerUid].soldiers += soldiers;
    byOwner[p.ownerUid].economyLevel += economyLevel;
  });

  const rows = Object.values(byOwner).map((row) => ({
    ...row,
    score: row.provinces * 100 + row.soldiers * 0.1 + row.economyLevel * 50,
  }));

  rows.sort((a, b) => b.score - a.score);
  return rows;
}
