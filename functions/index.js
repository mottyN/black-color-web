/*
  Cloud Function — "צבע שחור" polling service.
  רץ כל דקה ב-Google Cloud, שומר התרעות חדשות ל-Firestore.
  כך כל משתמש שנכנס לאתר רואה היסטוריה מלאה — גם אם אין אף אחד פתוח.
*/

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { initializeApp }  = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

initializeApp();
const db = getFirestore();

const NOTIFICATIONS_URL  = 'https://black-alert.com/notifications';
const LISTS_VERSIONS_URL = 'https://black-alert.com/lists-versions';

// dedup בזיכרון (מונע כתיבות כפולות בתוך אותו instance)
const seenKeys = [];

exports.pollAlerts = onSchedule(
  {
    schedule:  '* * * * *',       // כל דקה
    timeZone:  'Asia/Jerusalem',
    region:    'europe-west1',    // קרוב לישראל
    memory:    '256MiB',
    runtime:   'nodejs20',
  },
  async (_event) => {
    let events;
    try {
      const res = await fetch(NOTIFICATIONS_URL, { signal: AbortSignal.timeout(8000) });
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
      if (!ev.notificationId) continue;
      if (ev.status === 'closed') continue;

      // dedup לפי notificationId + version
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

      // merge: true — לא ידרוס אם כבר קיים, יעדכן רק שדות חדשים
      batch.set(db.collection('alerts').doc(ev.notificationId), data, { merge: true });
      writeCount++;
    }

    if (writeCount > 0) {
      await batch.commit();
      console.log(`Saved ${writeCount} alert(s) to Firestore.`);
    }
  }
);
