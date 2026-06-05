/*
  firebase-config.js — הגדרות Firebase.

  איך מקבלים את הערכים:
  1. עבור ל- https://console.firebase.google.com
  2. צור פרויקט חדש (או בחר קיים)
  3. לך ל-Project settings → Your apps → Add app → Web (</>)
  4. העתק את האובייקט firebaseConfig לכאן

  אחרי שיצרת את הפרויקט — הפעל Firestore:
  Firestore Database → Create database → Start in test mode (לפי הוראות למטה)

  חוקי אבטחה מומלצים ל-Firestore (rules):
  ──────────────────────────────────────────
  rules_version = '2';
  service cloud.firestore {
    match /databases/{database}/documents {
      match /alerts/{alertId} {
        allow read: if true;
        allow create: if request.resource.data.keys().hasAll(['notificationId','time','cities','eventType'])
                      && request.resource.data.time is number
                      && request.resource.data.cities is list
                      && request.resource.data.cities.size() > 0;
        allow update, delete: if false;
      }
    }
  }
  ──────────────────────────────────────────
*/

// adminKey — מפתח גישה לפאנל הסטטיסטיקות (?admin=VALUE)
const ADMIN_KEY = 'Tz3v4Sh4ch0r!St4ts#2026';

const FIREBASE_CONFIG = {
  adminKey: ADMIN_KEY,
  apiKey: "AIzaSyDl_rOHweHEZBBcu_oGRW7R8teH_sz3Pvk",
  authDomain: "tzeva-shachor.firebaseapp.com",
  projectId: "tzeva-shachor",
  storageBucket: "tzeva-shachor.firebasestorage.app",
  messagingSenderId: "191585340846",
  appId: "1:191585340846:web:86864cca19351ff9000c3f",
  measurementId: "G-2NQ321N365"
};




// // Import the functions you need from the SDKs you need
// import { initializeApp } from "firebase/app";
// import { getAnalytics } from "firebase/analytics";
// // TODO: Add SDKs for Firebase products that you want to use
// // https://firebase.google.com/docs/web/setup#available-libraries

// // Your web app's Firebase configuration
// // For Firebase JS SDK v7.20.0 and later, measurementId is optional
// const firebaseConfig = {
//   apiKey: "AIzaSyDl_rOHweHEZBBcu_oGRW7R8teH_sz3Pvk",
//   authDomain: "tzeva-shachor.firebaseapp.com",
//   projectId: "tzeva-shachor",
//   storageBucket: "tzeva-shachor.firebasestorage.app",
//   messagingSenderId: "191585340846",
//   appId: "1:191585340846:web:86864cca19351ff9000c3f",
//   measurementId: "G-2NQ321N365"
// };

// // Initialize Firebase
// const app = initializeApp(firebaseConfig);
// const analytics = getAnalytics(app);