// minigame.js
// Meydan okuma kabul edildiğinde açılan hızlı mini oyunların tanımları.
// Sunucu tarafı yok; sonuç challenge.js içindeki Firestore transaction'ları
// ile belirlenir, burada sadece oyun kuralları / veri tanımlıdır.

export const GAME_TYPES = [
  { id: "rps", label: "Taş - Kağıt - Makas", emoji: "✊", hint: "Klasik düello!" },
  { id: "emoji", label: "Emoji Düellosu", emoji: "🔥", hint: "Ateş, su, yaprak, şimşek, taş" },
  { id: "click", label: "Hız Testi", emoji: "⚡", hint: "İlk tıklayan kazanır!" },
  { id: "trivia", label: "Bilgi Yarışı", emoji: "🧠", hint: "İlk doğru cevap kazanır" },
];

export function gameTypeMeta(id) {
  return GAME_TYPES.find((g) => g.id === id) || GAME_TYPES[0];
}

// ---------------------------------------------------------------- Taş-Kağıt-Makas
export const RPS_OPTIONS = [
  { id: "rock", emoji: "✊", label: "Taş" },
  { id: "paper", emoji: "✋", label: "Kağıt" },
  { id: "scissors", emoji: "✌️", label: "Makas" },
];
const RPS_BEATS = { rock: "scissors", scissors: "paper", paper: "rock" };

/** 'a' ve 'b' oyuncularının seçimine göre kazananı döndürür: "a" | "b" | "draw" */
export function resolveRps(a, b) {
  if (a === b) return "draw";
  return RPS_BEATS[a] === b ? "a" : "b";
}

// ---------------------------------------------------------------- Emoji Düellosu
// Dairesel üstünlük: her eleman bir sonrakini yener, bir öncekine yenilir.
export const EMOJI_OPTIONS = [
  { id: "fire", emoji: "🔥", label: "Ateş" },
  { id: "leaf", emoji: "🌿", label: "Yaprak" },
  { id: "water", emoji: "💧", label: "Su" },
  { id: "bolt", emoji: "⚡", label: "Şimşek" },
  { id: "rock2", emoji: "🪨", label: "Taş" },
];
const EMOJI_ORDER = EMOJI_OPTIONS.map((o) => o.id);

export function resolveEmoji(a, b) {
  if (a === b) return "draw";
  const ia = EMOJI_ORDER.indexOf(a);
  const ib = EMOJI_ORDER.indexOf(b);
  return (ia + 1) % EMOJI_ORDER.length === ib ? "a" : "b";
}

// ---------------------------------------------------------------- Bilgi Yarışı
export const TRIVIA_QUESTIONS = [
  { q: "Türkiye'nin en kalabalık ili hangisidir?", options: ["Ankara", "İzmir", "İstanbul", "Bursa"], correct: 2 },
  { q: "Türkiye'de kaç il vardır?", options: ["73", "81", "85", "79"], correct: 1 },
  { q: "Anadolu'nun en yüksek dağı hangisidir?", options: ["Erciyes", "Ararat (Ağrı Dağı)", "Uludağ", "Nemrut"], correct: 1 },
  { q: "Kapadokya hangi bölgede yer alır?", options: ["Ege", "Karadeniz", "İç Anadolu", "Akdeniz"], correct: 2 },
  { q: "Türkiye'nin başkenti neresidir?", options: ["İstanbul", "İzmir", "Ankara", "Bursa"], correct: 2 },
  { q: "Pamukkale hangi ildedir?", options: ["Denizli", "Muğla", "Aydın", "Manisa"], correct: 0 },
  { q: "Türkiye'yi Asya ve Avrupa'ya ayıran boğaz hangisidir?", options: ["Çanakkale Boğazı", "İstanbul Boğazı", "Süveyş Kanalı", "Cebelitarık Boğazı"], correct: 1 },
  { q: "Van Gölü hangi bölgemizdedir?", options: ["Karadeniz", "Doğu Anadolu", "Güneydoğu Anadolu", "Marmara"], correct: 1 },
  { q: "Efes Antik Kenti hangi ile bağlıdır?", options: ["İzmir", "Aydın", "Muğla", "Manisa"], correct: 0 },
  { q: "Türkiye'nin en uzun nehri hangisidir?", options: ["Sakarya", "Fırat", "Kızılırmak", "Yeşilırmak"], correct: 2 },
];

/** Meydan okuma id'sinden deterministik olarak (herkeste aynı) soru seçer. */
export function pickTriviaQuestion(challengeId) {
  let h = 0;
  for (let i = 0; i < challengeId.length; i++) h = (h * 31 + challengeId.charCodeAt(i)) >>> 0;
  return TRIVIA_QUESTIONS[h % TRIVIA_QUESTIONS.length];
}
