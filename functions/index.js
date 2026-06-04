/*
  Cloud Functions — "צבע שחור"

  1. pollAlerts    — v1 pubsub.schedule, כל דקה: polling ל-black-alert.com → Firestore
  2. notifications — HTTP proxy עם CORS
  3. alertsHistory — HTTP proxy עם CORS
  4. listsVersions — HTTP proxy עם CORS

  שימוש ב-v1 בכל הפונקציות — נמנעים מבעיות IAM של v2 (Cloud Run).
*/

const functions = require('firebase-functions');
const { initializeApp }           = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

initializeApp();
const db      = getFirestore();
const REGION  = 'europe-west1';
const BLACK   = 'https://black-alert.com';

// ===== CORS helper =====
function setCors(res) {
  res.set('Access-Control-Allow-Origin',  '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
}

// ===== Proxy — /notifications =====
exports.notifications = functions.region(REGION).https.onRequest(async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  try {
    const r = await fetch(`${BLACK}/notifications`, { signal: AbortSignal.timeout(8000) });
    res.json(await r.json());
  } catch (e) { res.status(502).json([]); }
});

// ===== Proxy — /alerts-history =====
exports.alertsHistory = functions.region(REGION).https.onRequest(async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  try {
    const r = await fetch(`${BLACK}/alerts-history`, { signal: AbortSignal.timeout(10000) });
    res.json(await r.json());
  } catch (e) { res.status(502).json([]); }
});

// ===== Proxy — /lists-versions =====
exports.listsVersions = functions.region(REGION).https.onRequest(async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  try {
    const r = await fetch(`${BLACK}/lists-versions`, { signal: AbortSignal.timeout(8000) });
    res.json(await r.json());
  } catch (e) { res.status(502).json({}); }
});

// ===== Polling scheduled — v1 pubsub (ללא בעיות IAM של v2) =====
const seenKeys = [];

exports.pollAlertsJob = functions
  .region(REGION)
  .runWith({ memory: '256MB', timeoutSeconds: 55 })
  .pubsub.schedule('every 1 minutes')
  .onRun(async (_ctx) => {
    let events;
    try {
      const res = await fetch(`${BLACK}/notifications`, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) { console.warn('Poll HTTP error:', res.status); return null; }
      events = await res.json();
    } catch (e) {
      console.error('Fetch error:', e.message);
      return null;
    }

    if (!Array.isArray(events) || events.length === 0) return null;

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
    return null;
  });
