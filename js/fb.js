import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase, ref, set, update, get, onValue, push, remove, onChildAdded } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

export const configured = !!(firebaseConfig && firebaseConfig.apiKey && !String(firebaseConfig.apiKey).startsWith('YOUR_'));
let app, auth, db;
if (configured) { app = initializeApp(firebaseConfig); auth = getAuth(app); db = getDatabase(app); }
export { auth, db, ref, set, update, get, onValue, push, remove, onChildAdded, signInAnonymously, onAuthStateChanged };
