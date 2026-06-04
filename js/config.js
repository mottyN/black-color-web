/*
  ===== הגדרת שרת "צבע שחור" — נקודת העריכה היחידה לכתובת השרת =====

  פיתוח מקומי:  "http://localhost:8000"
  פרודקשן:      הדומיין מאחורי Cloudflare, למשל "https://api.tzeva-shachor.example"

  ⚠️ לפני אריזה לפרודקשן (packaging):
     1. החלף את SERVER_BASE_URL לדומיין הפרודקשן (https).
     2. עדכן בהתאמה את host_permissions ב-manifest.json (הסר את localhost).
     אם שוכחים — התוסף ימשיך לפנות ל-localhost (ר' אזהרת ה-console למטה).

  הקובץ נטען *ראשון* בכל מסמך שצורך אותו (backgroundPage / popup / alert),
  כך ש-SERVER_BASE_URL זמין כמשתנה גלובלי ל-City.js ול-background.js.
*/
// האתר קורא רק ל-Firestore REST API (עובד דרך NetFree).
// ה-Cloud Function (server-side) מבצע את ה-polling ל-black-alert.com.

// קבצים סטטיים — מאוחסנים בריפו (ללא CORS)
const CITIES_JSON_URL   = '/black-color-web/static/cities.json';
const POLYGONS_JSON_URL = null; // לא בשימוש
