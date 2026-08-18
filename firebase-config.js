// firebase-config.js
// Bu dosyadaki bağlantı bilgilerini DEĞİŞTİRMEYİN.
// (Do not change the connection config in this file.)

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  connectFirestoreEmulator,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB_koQbWEWJttmcIFiRmymIQjOMaP-_7I8",
  authDomain: "nokey-35c2f.firebaseapp.com",
  projectId: "nokey-35c2f",
  storageBucket: "nokey-35c2f.firebasestorage.app",
  messagingSenderId: "218520281536",
  appId: "1:218520281536:web:1248ab6e6d9ce5d8a56825",
  measurementId: "G-XV19FWW2ZV",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export { onAuthStateChanged, signInAnonymously, updateProfile };

// Oturum başına sabit bir oda "dönemi" (session bucket).
// Sohbet ve tepkiler bu döneme yazılır; dönem değişince (ör. 24 saatte bir)
// eski mesajlar artık sorgulanmaz -> kalıcı arşiv oluşmaz.
export const ROOM_TTL_MS = 24 * 60 * 60 * 1000; // 24 saat (1 saatlik oda istenirse: 60*60*1000)
export function currentSession() {
  return Math.floor(Date.now() / ROOM_TTL_MS);
}

// Bir ilin geçici olarak "ele geçirilmiş" sayılacağı süre.
export const CAPTURE_TTL_MS = 15 * 60 * 1000; // 15 dakika

// Basit oyuncu renk paleti (takım/il rengi olarak kullanılır).
export const PLAYER_COLORS = [
  "#FF6B5E", "#FFB84D", "#FFE066", "#8CE99A", "#63E6BE",
  "#66D9E8", "#74C0FC", "#B197FC", "#F783AC", "#FF922B",
];
export function colorForUid(uid) {
  let h = 0;
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0;
  return PLAYER_COLORS[h % PLAYER_COLORS.length];
}
