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
const SERVER_BASE_URL = "https://black-alert.com";

// חיווי בולט אם נשארה כתובת פיתוח — מונע אריזת פרודקשן עם localhost בלי לשים לב.
if (/^https?:\/\/(localhost|127\.0\.0\.1)/.test(SERVER_BASE_URL)) {
  console.warn(
    '[צבע שחור] config.js: SERVER_BASE_URL מצביע ל-localhost (מצב פיתוח). ' +
      "החלף לדומיין פרודקשן + עדכן host_permissions לפני אריזה."
  );
}

// נקודות הקצה הנגזרות (אין WebSocket — polling בלבד, SPEC §4.6).
const NOTIFICATIONS_API_URL = `${SERVER_BASE_URL}/notifications`;
const LISTS_VERSIONS_URL = `${SERVER_BASE_URL}/lists-versions`;
const CITIES_JSON_URL = `${SERVER_BASE_URL}/static/cities.json`;
const POLYGONS_JSON_URL = `${SERVER_BASE_URL}/static/polygons.json`;
const ALERTS_HISTORY_URL = `${SERVER_BASE_URL}/alerts-history`;
