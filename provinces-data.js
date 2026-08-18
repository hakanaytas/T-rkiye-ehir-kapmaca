// provinces-data.js
// Türkiye'nin 81 ili: plaka kodu (id), ad ve komşuluk verisi.
// Komşuluk verisi coğrafi sınır komşuluğuna dayanır (kara sınırı).
// Not: Bazı kıyı/boğaz komşulukları (ör. Çanakkale-Tekirdağ) kara bağlantısı
// olarak kabul edilmiştir. Üretimde gerekirse hassas GIS analiziyle
// (ör. turf.js booleanIntersects) otomatik doğrulanabilir.

export const PROVINCE_NAMES = {
  1: "Adana", 2: "Adıyaman", 3: "Afyonkarahisar", 4: "Ağrı", 5: "Amasya",
  6: "Ankara", 7: "Antalya", 8: "Artvin", 9: "Aydın", 10: "Balıkesir",
  11: "Bilecik", 12: "Bingöl", 13: "Bitlis", 14: "Bolu", 15: "Burdur",
  16: "Bursa", 17: "Çanakkale", 18: "Çankırı", 19: "Çorum", 20: "Denizli",
  21: "Diyarbakır", 22: "Edirne", 23: "Elazığ", 24: "Erzincan", 25: "Erzurum",
  26: "Eskişehir", 27: "Gaziantep", 28: "Giresun", 29: "Gümüşhane", 30: "Hakkari",
  31: "Hatay", 32: "Isparta", 33: "Mersin", 34: "İstanbul", 35: "İzmir",
  36: "Kars", 37: "Kastamonu", 38: "Kayseri", 39: "Kırklareli", 40: "Kırşehir",
  41: "Kocaeli", 42: "Konya", 43: "Kütahya", 44: "Malatya", 45: "Manisa",
  46: "Kahramanmaraş", 47: "Mardin", 48: "Muğla", 49: "Muş", 50: "Nevşehir",
  51: "Niğde", 52: "Ordu", 53: "Rize", 54: "Sakarya", 55: "Samsun",
  56: "Siirt", 57: "Sinop", 58: "Sivas", 59: "Tekirdağ", 60: "Tokat",
  61: "Trabzon", 62: "Tunceli", 63: "Şanlıurfa", 64: "Uşak", 65: "Van",
  66: "Yozgat", 67: "Zonguldak", 68: "Aksaray", 69: "Bayburt", 70: "Karaman",
  71: "Kırıkkale", 72: "Batman", 73: "Şırnak", 74: "Bartın", 75: "Ardahan",
  76: "Iğdır", 77: "Yalova", 78: "Karabük", 79: "Kilis", 80: "Osmaniye",
  81: "Düzce",
};

// GeoJSON kaynağındaki bazı isim yazımları farklı olabilir (ör. "Afyon").
// Ada eşleştirmesi için normalize edilmiş isim -> plaka kodu haritası.
export const NAME_TO_ID = {};
for (const [id, name] of Object.entries(PROVINCE_NAMES)) {
  NAME_TO_ID[normalizeName(name)] = Number(id);
}
// Bilinen alternatif yazımlar
NAME_TO_ID[normalizeName("Afyon")] = 3;
NAME_TO_ID[normalizeName("Mersin (İçel)")] = 33;
NAME_TO_ID[normalizeName("İçel")] = 33;
NAME_TO_ID[normalizeName("K.Maraş")] = 46;
NAME_TO_ID[normalizeName("Kahramanmaras")] = 46;

export function normalizeName(s) {
  return s
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]/g, "");
}

// Komşuluk kenar listesi (undirected edges), plaka kodlarıyla.
const EDGES = [
  [22, 39], [22, 59], [39, 59], [39, 34], [59, 34], [59, 17],
  [34, 41], [41, 54], [41, 77], [41, 16], [77, 16],
  [16, 77], [16, 54], [16, 11], [16, 10], [16, 17],
  [54, 11], [54, 14], [54, 81],
  [81, 14], [81, 54], [81, 67], [81, 74],
  [17, 10],
  [10, 43], [10, 45],
  [11, 14], [11, 26], [11, 43],
  [14, 26], [14, 6], [14, 18], [14, 78], [14, 67],
  [67, 78], [67, 74],
  [78, 74], [78, 37], [78, 18], [78, 14],
  [74, 37],
  [37, 18], [37, 19], [37, 57], [37, 55],
  [18, 6], [18, 19], [18, 71],
  [57, 55],
  [55, 19], [55, 5], [55, 60], [55, 52],
  [19, 6], [19, 66], [19, 5],
  [5, 60], [5, 66],
  [60, 52], [60, 58], [60, 66], [60, 28],
  [52, 28], [52, 58],
  [28, 58], [28, 29], [28, 61],
  [61, 29], [61, 53], [61, 69],
  [53, 25], [53, 8], [53, 69],
  [8, 25], [8, 75],
  [75, 8], [75, 36], [75, 25],
  [36, 25], [36, 4], [36, 76],
  [76, 4],
  [4, 25], [4, 49], [4, 65],
  [65, 49], [65, 13], [65, 30],
  [30, 73],
  [73, 56], [73, 47],
  [47, 56], [47, 21], [47, 72], [47, 63],
  [56, 72], [56, 13],
  [72, 13], [72, 21], [72, 49],
  [13, 49],
  [49, 12], [49, 21],
  [12, 25], [12, 24], [12, 21], [12, 23], [12, 62],
  [25, 24], [25, 69],
  [24, 69], [24, 29], [24, 58], [24, 62],
  [29, 69],
  [62, 23], [62, 44], [62, 58],
  [23, 44], [23, 21],
  [21, 44], [21, 63],
  [44, 58], [44, 46], [44, 2],
  [58, 66], [58, 38], [58, 46],
  [66, 38], [66, 40], [66, 71],
  [38, 46], [38, 1], [38, 51], [38, 50], [38, 40],
  [40, 50], [40, 71], [40, 68],
  [71, 6], [71, 40],
  [6, 68], [6, 42], [6, 26],
  [26, 3], [26, 42],
  [42, 3], [42, 32], [42, 7], [42, 70], [42, 51], [42, 68],
  [3, 43], [3, 64], [3, 20], [3, 15], [3, 32],
  [43, 64], [43, 45],
  [64, 45], [64, 9], [64, 20],
  [45, 9], [45, 35],
  [35, 9],
  [9, 20], [9, 48],
  [20, 15], [20, 48],
  [48, 15], [48, 7],
  [15, 32], [15, 7],
  [32, 7],
  [70, 33], [70, 42],
  [33, 51], [33, 1], [33, 70],
  [51, 68], [51, 50], [51, 1], [51, 33],
  [50, 68],
  [68, 51],
  [1, 51], [1, 46], [1, 80], [1, 31],
  [80, 46], [80, 31], [80, 27],
  [46, 2], [46, 27], [46, 80],
  [27, 2], [27, 63], [27, 79], [27, 80],
  [79, 27], [79, 31],
  [31, 80], [31, 79],
  [2, 44], [2, 27], [2, 63], [2, 21],
  [63, 21],
];

export const NEIGHBORS = {};
for (let i = 1; i <= 81; i++) NEIGHBORS[i] = new Set();
for (const [a, b] of EDGES) {
  NEIGHBORS[a].add(b);
  NEIGHBORS[b].add(a);
}
for (const id of Object.keys(NEIGHBORS)) {
  NEIGHBORS[id] = [...NEIGHBORS[id]];
}

export function getNeighbors(provinceId) {
  return NEIGHBORS[provinceId] || [];
}

export function areNeighbors(a, b) {
  return NEIGHBORS[a] ? NEIGHBORS[a].includes(Number(b)) : false;
}

// Bina tanımları: temel maliyet, seviye başına maliyet çarpanı, temel üretim.
export const BUILDINGS = {
  farm:    { key: "farm",    label: "Çiftlik",  resource: "food", baseCost: { gold: 50 },  baseProd: 4 },
  mine:    { key: "mine",    label: "Maden",    resource: "iron", baseCost: { gold: 60 },  baseProd: 3 },
  market:  { key: "market",  label: "Ticaret",  resource: "gold", baseCost: { gold: 40 },  baseProd: 5 },
  barracks:{ key: "barracks",label: "Kışla",    resource: "soldiers", baseCost: { gold: 80, iron: 20 }, baseProd: 1 },
  defense: { key: "defense", label: "Savunma",  resource: "defense",  baseCost: { gold: 70, iron: 30 }, baseProd: 2 },
};

export function buildingCost(buildingKey, currentLevel) {
  const def = BUILDINGS[buildingKey];
  const mult = Math.pow(1.55, currentLevel);
  const cost = {};
  for (const [res, amt] of Object.entries(def.baseCost)) {
    cost[res] = Math.round(amt * mult);
  }
  return cost;
}
