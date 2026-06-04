/*
  Cloud Functions — "צבע שחור"

  1. pollAlerts     — scheduled, כל דקה: polling ל-black-alert.com → שמירה ב-Firestore
  2. notifications  — HTTP proxy: מחזיר /notifications עם CORS headers
  3. alertsHistory  — HTTP proxy: מחזיר /alerts-history עם CORS headers
  4. listsVersions  — HTTP proxy: מחזיר /lists-versions עם CORS headers

  ה-proxy פותר את בעיית ה-CORS: האתר קורא ל-Firebase Functions (HTTPS רגיל),
  ה-Function קורא ל-black-alert.com מצד השרת (ללא CORS), ומחזיר תוצאות.
*/

const functions              = require('firebase-functions');
const { onSchedule }         = require('firebase-functions/v2/scheduler');
const { initializeApp }      = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

initializeApp();
const db = getFirestore();

const BLACK_ALERT = 'https://black-alert.com';
const REGION      = 'europe-west1';

// ===== CORS helper =====
function setCors(res) {
  res.set('Access-Control-Allow-Origin',  '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.set('Cache-Control', 'public, max-age=5'); // מאפשר cache קצר כמו השרת המקורי
}

// ===== Proxy — /notifications =====
exports.notifications = functions
  .region(REGION)
  .https.onRequest(async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    try {
      const r = await fetch(`${BLACK_ALERT}/notifications`, { signal: AbortSignal.timeout(8000) });
      const d = await r.json();
      res.json(d);
    } catch (e) {
      console.error('proxy /notifications error:', e.message);
      res.status(502).json([]);
    }
  });

// ===== Proxy — /alerts-history =====
exports.alertsHistory = functions
  .region(REGION)
  .https.onRequest(async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    try {
      const r = await fetch(`${BLACK_ALERT}/alerts-history`, { signal: AbortSignal.timeout(10000) });
      const d = await r.json();
      res.json(d);
    } catch (e) {
      console.error('proxy /alerts-history error:', e.message);
      res.status(502).json([]);
    }
  });

// ===== Proxy — /lists-versions =====
exports.listsVersions = functions
  .region(REGION)
  .https.onRequest(async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    try {
      const r = await fetch(`${BLACK_ALERT}/lists-versions`, { signal: AbortSignal.timeout(8000) });
      const d = await r.json();
      res.json(d);
    } catch (e) {
      res.status(502).json({});
    }
  });

// ===== Scheduled polling — שמירה ל-Firestore =====
const seenKeys = [];

exports.pollAlerts = onSchedule(
  {
    schedule: '* * * * *',
    timeZone: 'Asia/Jerusalem',
    region:   REGION,
    memory:   '256MiB',
    runtime:  'nodejs20',
  },
  async (_event) => {
    let events;
    try {
      const res = await fetch(`${BLACK_ALERT}/notifications`, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) { console.warn('Poll HTTP error:', res.status); return; }
      events = await res.json();
    } catch (e) {
      console.error('Fetch error:', e.message);
      return;
    }

    if (!Array.isArray(events) || events.length === 0) return;

    const batch = db.batch();
    let writeCount = 0;

    for (const ev of events) {
      if (!ev.notificationId || ev.status === 'closed') continue;

      const key = ev.notificationId + ':' + (ev.version || 1);
      if (seenKeys.includes(key)) continue;
      seenKeys.push(key);
      if (seenKeys.length > 500) seenKeys.shift();

      const data = {
        notificationId: ev.notificationId,
        time:      ev.time || Math.floor(Date.now() / 1000),
        cities:    Array.isArray(ev.cities) ? ev.cities : [],
        eventType: ev.eventType ?? 8,
        address:   ev.address || '',
        note:      ev.note    || '',
        version:   ev.version || 1,
        savedAt:   FieldValue.serverTimestamp(),
      };
      if (typeof ev.lat === 'number') data.lat = ev.lat;
      if (typeof ev.lng === 'number') data.lng = ev.lng;

      batch.set(db.collection('alerts').doc(ev.notificationId), data, { merge: true });
      writeCount++;
    }

    if (writeCount > 0) {
      await batch.commit();
      console.log(`Saved ${writeCount} alert(s) to Firestore.`);
    }
  }
);
