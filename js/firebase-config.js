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

const FIREBASE_CONFIG = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID",
};
