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
// Firebase Functions proxy — מונע CORS (השרת קורא ל-black-alert.com, לא הדפדפן)
const FIREBASE_PROJECT_ID = 'tzeva-shachor';
const FIREBASE_REGION     = 'europe-west1';
const FUNCTIONS_BASE      = `https://${FIREBASE_REGION}-${FIREBASE_PROJECT_ID}.cloudfunctions.net`;

// כל הבקשות הדינמיות עוברות דרך Firebase Functions (ללא CORS)
const NOTIFICATIONS_API_URL = `${FUNCTIONS_BASE}/notifications`;
const LISTS_VERSIONS_URL    = `${FUNCTIONS_BASE}/listsVersions`;
const ALERTS_HISTORY_URL    = `${FUNCTIONS_BASE}/alertsHistory`;

// קבצים סטטיים — מאוחסנים בריפו
const CITIES_JSON_URL   = '/black-color-web/static/cities.json';
const POLYGONS_JSON_URL = '/black-color-web/static/polygons.json';
