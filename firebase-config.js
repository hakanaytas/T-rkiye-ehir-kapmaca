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
