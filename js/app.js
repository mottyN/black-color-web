/*
  app.js — גרסת אתר (GitHub Pages).
  משלב את לולאת ה-polling (background.js) ואת ממשק המשתמש (popup.js).
  אין chrome.* — הכל רץ בדפדפן רגיל.
*/

// ============================================================
// State
// ============================================================
var currentCities      = [];
var currentAlertCities = [];
var countdownInterval;

// ============================================================
// היסטוריה מקומית (localStorage)
// ============================================================
const LOCAL_HISTORY_KEY = 'localAlertHistory';
const LOCAL_HISTORY_MAX = 2000;

function saveAlertToLocalHistory(alert) {
  if (!alert || !Array.isArray(alert.cities) || alert.cities.length === 0) return;
  try {
    const stored = JSON.parse(localStorage.getItem(LOCAL_HISTORY_KEY) || '[]');
    // dedup לפי notificationId
    if (stored.some(item => item._notifId === alert.notificationId)) return;
    const item = {
      _notifId: alert.notificationId,
      id: 'local-' + alert.notificationId,
      alerts: [{
        time:      alert.time || Math.floor(Date.now() / 1000),
        cities:    alert.cities,
        eventType: alert.eventType ?? 8,
        address:   alert.address || '',
        note:      alert.note    || '',
        ...(typeof alert.lat === 'number' ? { lat: alert.lat } : {}),
        ...(typeof alert.lng === 'number' ? { lng: alert.lng } : {}),
      }],
    };
    stored.unshift(item);
    if (stored.length > LOCAL_HISTORY_MAX) stored.length = LOCAL_HISTORY_MAX;
    localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify(stored));
  } catch {}
}

function getLocalHistory() {
  try { return JSON.parse(localStorage.getItem(LOCAL_HISTORY_KEY) || '[]'); }
  catch { return []; }
}

function clearLocalHistory() {
  localStorage.removeItem(LOCAL_HISTORY_KEY);
}

// ============================================================
// Firestore — היסטוריה משותפת לכל המשתמשים
// ============================================================
let db = null;

(function initFirebase() {
  try {
    if (
      typeof FIREBASE_CONFIG === 'undefined' ||
      FIREBASE_CONFIG.projectId === 'YOUR_PROJECT_ID'
    ) return; // config לא הוגדר עדיין
    firebase.initializeApp(FIREBASE_CONFIG);
    db = firebase.firestore();
  } catch (e) {
    console.warn('[צבע שחור] Firebase init error:', e);
  }
})();

async function saveAlertToFirestore(alert) {
  if (!db || !alert?.notificationId) return;
  try {
    await db.collection('alerts').doc(alert.notificationId).set({
      notificationId: alert.notificationId,
      time:      alert.time || Math.floor(Date.now() / 1000),
      cities:    Array.isArray(alert.cities) ? alert.cities : [],
      eventType: alert.eventType ?? 8,
      address:   alert.address || '',
      note:      alert.note    || '',
      ...(typeof alert.lat === 'number' ? { lat: alert.lat } : {}),
      ...(typeof alert.lng === 'number' ? { lng: alert.lng } : {}),
      savedAt:   firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true }); // merge: לא ידרוס אם כבר קיים
  } catch (e) {
    console.warn('[צבע שחור] Firestore write error:', e);
  }
}

async function loadHistoryFromFirestore(limit = 1000) {
  if (!db) return [];
  try {
    const snap = await db.collection('alerts')
      .orderBy('time', 'desc')
      .limit(limit)
      .get();
    return snap.docs.map(doc => {
      const d = doc.data();
      return {
        id:       'fb-' + doc.id,
        _notifId: d.notificationId,
        alerts:   [{
          time:      d.time,
          cities:    d.cities || [],
          eventType: d.eventType ?? 8,
          address:   d.address || '',
          note:      d.note    || '',
          ...(typeof d.lat === 'number' ? { lat: d.lat } : {}),
          ...(typeof d.lng === 'number' ? { lng: d.lng } : {}),
        }],
      };
    });
  } catch (e) {
    console.warn('[צבע שחור] Firestore read error:', e);
    return [];
  }
}

const POLL_INTERVAL_MS = 10000;
const WATCHDOG_MS      = 125000;
let connectionStatus = 0;   // 0 = מחובר, 1 = מנותק
let lastOkTime       = Date.now();
let pollFailures     = 0;
var rcvNotificationIds = [];

// ============================================================
// Alert Overlay
// ============================================================
let alertOverlayVisible = false;
let mapEverShown        = false;

function showAlertOverlay() {
  const overlay = document.getElementById('alertOverlay');
  if (!overlay) return;
  overlay.hidden = false;
  alertOverlayVisible = true;

  // טעינת מפה lazy — רק בפעם הראשונה
  if (!mapEverShown) {
    mapEverShown = true;
    if (typeof loadMap === 'function') loadMap();
  } else if (typeof invalidateMap === 'function') {
    invalidateMap();
  }

  // איפוס פס מרחק
  const bar = document.getElementById('distanceBar');
  if (bar) bar.hidden = true;
}

function closeAlertOverlay() {
  const overlay = document.getElementById('alertOverlay');
  if (!overlay) return;
  overlay.hidden = true;
  alertOverlayVisible = false;
}

document.addEventListener('DOMContentLoaded', () => {
  const closeBtn = document.getElementById('closeAlert');
  if (closeBtn) closeBtn.onclick = closeAlertOverlay;
});

// ============================================================
// Polling
// ============================================================
async function checkListsVersion({ polygons, cities }) {
  await Promise.allSettled([
    Preferences.setPolygonsVersion(polygons),
    Preferences.setCitiesVersion(cities),
  ]);
  await City.loadData();
}

async function fetchAndCheckLists() {
  const data = await fetch(LISTS_VERSIONS_URL).then(r => r.json());
  if (data.polygons && data.cities) await checkListsVersion(data);
}

setInterval(() => fetchAndCheckLists().catch(() => null), 24 * 60 * 60 * 1000);

async function pollNotifications() {
  try {
    const res    = await fetch(NOTIFICATIONS_API_URL);
    if (!res.ok) throw new Error(res.status);
    const events = await res.json();
    lastOkTime   = Date.now();
    connectionStatus = 0;
    pollFailures     = 0;
    for (const ev of events) getAlerts(ev, 'poll');
  } catch (_) {
    pollFailures++;
    if (Date.now() - lastOkTime > WATCHDOG_MS) connectionStatus = 1;
  }
}

function scheduleNextPoll() {
  const base  = pollFailures > 0
    ? Math.min(POLL_INTERVAL_MS * Math.pow(2, pollFailures - 1), 60000)
    : POLL_INTERVAL_MS;
  const delay = base * (0.85 + Math.random() * 0.3);
  setTimeout(runPollCycle, delay);
}

async function runPollCycle() {
  await pollNotifications();
  scheduleNextPoll();
}

// ============================================================
// Alert Processing
// ============================================================
async function getAlerts(alert, source, testAlert = false) {
  if (!alert.notificationId) alert.notificationId = String(Math.random());
  if (typeof alert.eventType === 'undefined') alert.eventType = 8;

  const dedupKey = alert.notificationId + ':' + (alert.version || 1);
  if (rcvNotificationIds.includes(dedupKey)) return;
  rcvNotificationIds.push(dedupKey);
  if (rcvNotificationIds.length > 100) rcvNotificationIds.shift();

  if (alert.status === 'closed') return endAlert(alert);

  const [selCities, selAreas, selTypes, silentNotSel] = await Promise.all([
    Preferences.getSelectedCities(),
    Preferences.getSelectedAreas(),
    Preferences.getSelectedEventTypes(),
    Preferences.getSilentNotSelected(),
  ]);

  const expireAt   = alert.expireAt || ((alert.time || Math.floor(Date.now() / 1000)) + 5400);
  var alertCities  = alert.cities.map(v =>
    new City(v, alert.eventType, expireAt, Math.floor(Date.now() / 1000))
  );

  alertCities.forEach(c => {
    c.notificationId = alert.notificationId;
    c.note    = alert.note    || '';
    c.address = alert.address || '';
    if (typeof alert.lat === 'number') c.lat = alert.lat;
    if (typeof alert.lng === 'number') c.lng = alert.lng;
  });

  const selectAll = selCities.length === 0 && selAreas.length === 0;
  alertCities = alertCities.filter(c => {
    if (selTypes.length !== 0 && !selTypes.includes(c.eventType)) return false;
    return (
      silentNotSel ||
      selCities.includes(c.id) ||
      selAreas.includes(c.areaID) ||
      selectAll ||
      testAlert ||
      City.virtualCitiesIds.includes(c.id)
    );
  });
  if (alertCities.length === 0) return;

  const anySelected = alertCities.some(c =>
    selCities.includes(c.id) || selAreas.includes(c.areaID) || City.virtualCitiesIds.includes(c.id)
  );

  if (!alert.silent && (!(silentNotSel && !anySelected) || selectAll))
    Preferences.playSound(alertCities.map(c => c.id).filter(id => id !== -1).sort((a,b) => a-b), alert.eventType);

  // עדכון אירוע קיים (version עלה) — מחליפים במקום להכפיל
  currentCities      = currentCities.filter(c => c.notificationId !== alert.notificationId);
  currentAlertCities = currentAlertCities.filter(c => c.notificationId !== alert.notificationId);
  currentCities      = currentCities.concat(alertCities);
  currentAlertCities = currentAlertCities.concat(alertCities);

  // שמירה להיסטוריה (לא בדיקות)
  if (!testAlert) {
    saveAlertToLocalHistory(alert);   // fallback מקומי
    saveAlertToFirestore(alert);      // שיתוף עם כל המשתמשים
  }

  const desktop = await Preferences.getSelectedDesktop();
  if (desktop && alertCities.length && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    notifyDesktop(alertCities);
  }

  // תמיד גם מציגים overlay
  showAlertOverlay();
  if (typeof alertsListener === 'function') alertsListener(currentCities);

  // countdown — מסיר ערים שפג זמנן
  if (!countdownInterval) {
    countdownInterval = setInterval(() => {
      currentCities = currentCities.filter(c => c.getCountdown() > 0);
      if (currentCities.length === 0) return finishAlert();
      if (alertOverlayVisible && typeof alertsListener === 'function') alertsListener(currentCities);
    }, 1000);
  }
}

function finishAlert() {
  currentCities = currentAlertCities = [];
  if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
  closeAlertOverlay();
}

async function endAlert(alert) {
  const id     = alert.notificationId;
  const before = currentCities.length;
  currentCities      = currentCities.filter(c => c.notificationId !== id);
  currentAlertCities = currentAlertCities.filter(c => c.notificationId !== id);
  if (currentCities.length === before) return;

  if (currentCities.length === 0) {
    if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
    if (alertOverlayVisible && typeof showEndedFlash === 'function') showEndedFlash();
  } else {
    if (alertOverlayVisible && typeof alertsListener === 'function') alertsListener(currentCities);
  }
}

// ============================================================
// Web Notifications
// ============================================================
function notifyDesktop(cities) {
  City.siteLanguage = 'HE';
  const byType = {};
  cities.forEach(c => { (byType[c.eventType] = byType[c.eventType] || []).push(c); });

  Object.keys(byType).forEach(t => {
    const group     = byType[t];
    const locations = group.map(c => c.address ? `${c.getLocalizationCityName()}, ${c.address}` : c.getLocalizationCityName());
    const title     = City.getLocalizationEventTypeTitle(Number(t));
    const body      = locations.join(' · ');
    const notif     = new Notification(title, { body, icon: 'img/notify.png' });
    notif.onclick   = () => { showAlertOverlay(); window.focus(); };
  });
}

// ============================================================
// Test Alert
// ============================================================
const TEST_EVENT_TYPES = [3, 0, 2];
let testEventTypeIdx   = 0;

function triggerTestAlert() {
  const now = Math.floor(Date.now() / 1000);
  const t   = TEST_EVENT_TYPES[testEventTypeIdx % TEST_EVENT_TYPES.length];
  testEventTypeIdx++;
  getAlerts({
    cities:         ['בדיקה'],
    eventType:      t,
    time:           now,
    expireAt:       now + 60,
    notificationId: 'test-' + Date.now(),
  }, 'test', true);
}

// ניקוי currentAlertCities — שמור על רשימה קצרה
setInterval(() => {
  currentAlertCities = currentAlertCities.filter(c => Date.now() - c.timestamp * 1000 < 3 * 60 * 1000);
}, 60 * 1000);

// ============================================================
// History + Settings UI  (מ-popup.js, ללא chrome.*)
// ============================================================
var siteLanguage = 'HE';
var allCities    = [];
var allAreas     = [];

City.loadDataSync();

window.addEventListener('load', async () => {
  siteLanguage = await Preferences.getSelectedLanguage();
  allCities    = await City.getAllCities();
  allAreas     = await City.getAllAreas();
  await loadSettings().catch(console.error);
  loadHistory();

  await fetchAndCheckLists().catch(() => null);
  runPollCycle(); // מתחיל את לולאת ה-polling

  const desktop = await Preferences.getSelectedDesktop();
  if (desktop && typeof Notification !== 'undefined' && Notification.permission === 'default') {
    Notification.requestPermission();
  }
});

// ===== ניווט בין מסכים =====
const historyScreen  = document.getElementById('historyScreen');
const settingsScreen = document.getElementById('settingsScreen');

document.getElementById('openSettings').onclick = () => {
  settingsScreen.hidden = false;
  document.querySelector('.settings-inner')?.scrollTo(0, 0);
};

document.getElementById('backFromSettings').onclick = () => {
  settingsScreen.hidden = true;
  loadHistory();
};

// ===== היסטוריה =====
const ICON_EVENT_TYPES = [0, 2, 3, 8];

async function loadHistory() {
  const homeBody = document.querySelector('.page-inner') || historyScreen;
  let history = document.getElementById('history');
  if (history) history.remove();
  history = document.createElement('div');
  history.id = 'history';

  // טעינה מקבילה משלושה מקורות
  const [serverFeed, firestoreFeed] = await Promise.all([
    fetch(ALERTS_HISTORY_URL).then(r => r.json()).catch(() => []),
    loadHistoryFromFirestore(),
  ]);
  const localFeed = getLocalHistory();

  // dedup: notifIds + זמנים (רזולוציית דקה) של פריטי השרת
  const serverNotifIds = new Set([
    ...serverFeed.map(i => i._notifId),
    ...firestoreFeed.map(i => i._notifId),
  ].filter(Boolean));
  const serverMinutes = new Set([
    ...serverFeed,
    ...firestoreFeed,
  ].flatMap(i => (i.alerts || []).map(a => Math.floor((a.time || 0) / 60))));

  // פריטים מקומיים שאינם ב-Firestore/שרת (fallback למקרה שFirestore לא הוגדר)
  const localOnly = localFeed.filter(item =>
    !serverNotifIds.has(item._notifId) &&
    !(item.alerts?.[0]?.time && serverMinutes.has(Math.floor(item.alerts[0].time / 60)))
  );

  // מיזוג + מיון לפי זמן (חדש ראשון)
  const feed = [...serverFeed, ...firestoreFeed, ...localOnly].sort((a, b) => {
    const tA = Math.max(...(a.alerts || []).map(x => x.time || 0));
    const tB = Math.max(...(b.alerts || []).map(x => x.time || 0));
    return tB - tA;
  });

  (Array.isArray(feed) ? feed : []).forEach(data => {
    if (!data || !Array.isArray(data.alerts)) return;
    const historyItem  = new History(data);
    const dateString   = historyItem.getDate();
    const citiesNames  = historyItem.getCitiesNames();
    const first        = data.alerts[0] || {};
    let primaryEvent   = historyItem.getThreatsIDs()[0];
    if (!ICON_EVENT_TYPES.includes(primaryEvent)) primaryEvent = 8;

    const locationText = citiesNames.join(', ') + (first.address ? ', ' + first.address : '');

    const item = document.createElement('div');
    item.className = 'history_item';

    const icon = document.createElement('span');
    icon.className = 'hi-icon';
    icon.setAttribute('data-event', String(primaryEvent));
    icon.innerHTML = eventIconSvg(primaryEvent, 22);

    const body = document.createElement('div');
    body.className = 'hi-body';

    const title = document.createElement('div');
    title.className = 'hi-title';
    title.textContent = City.getLocalizationEventTypeTitle(primaryEvent);

    const time = document.createElement('div');
    time.className = 'hi-time';
    time.textContent = dateString;

    const location = document.createElement('div');
    location.className = 'hi-cities';
    location.textContent = locationText;

    body.append(title, time, location);

    if (first.note) {
      const note = document.createElement('div');
      note.className = 'hi-note';
      note.textContent = first.note;
      body.appendChild(note);
    }

    item.append(icon, body);
    item.setAttribute('role', 'button');
    item.tabIndex = 0;

    const open = () => openHistoryMap(primaryEvent, citiesNames.join(', '), first);
    item.onclick   = open;
    item.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } };

    history.appendChild(item);
  });

  if (!history.children.length) {
    const empty = document.createElement('p');
    empty.className = 'history_empty';
    empty.textContent = 'אין עדיין היסטוריית אירועים';
    history.appendChild(empty);
  }

  homeBody.appendChild(history);
}

function openHistoryMap(eventType, cityName, alert) {
  showAlertOverlay();
  if (typeof renderFromParams !== 'function') return;
  const params = new URLSearchParams();
  params.set('history',   '1');
  params.set('eventType', String(eventType));
  params.set('city',      cityName);
  if (alert.address) params.set('address', alert.address);
  if (alert.note)    params.set('note',    alert.note);
  if (typeof alert.lat === 'number') params.set('lat', String(alert.lat));
  if (typeof alert.lng === 'number') params.set('lng', String(alert.lng));
  renderFromParams(params);
}

// ===== חיפוש + בחירת אזורים =====
var selectionCitiesIDs = [];
var selectionAreaIDs   = [];
var founds             = [];
var currentFocusIndex;

const searchInput        = document.getElementById('search');
const silentNotSelectedBox = document.getElementById('silentNotSelectedBox');

const normalize = s => s.toLowerCase().replace(/[0-9 ~`!@#$%^&*()+={}\[\];\-\:\'\"<>.,\/\\\?_]/g, '');

searchInput.oninput = function () {
  const existing = document.getElementById('autocomplete');
  if (existing) existing.remove();
  if (!this.value) return;

  const q = normalize(this.value);
  founds = [
    ...allAreas.filter(a => normalize(a.getLocalizationAreaName()).includes(q)),
    ...allCities.filter(c => normalize(c.getLocalizationCityName()).includes(q)),
  ].slice(0, 50);
  if (!founds.length) return;

  const autocomplete = document.createElement('div');
  autocomplete.id = 'autocomplete';

  founds.forEach((found, index) => {
    const option = document.createElement('button');
    option.type      = 'button';
    option.className = 'ac-option';
    if (found instanceof City) {
      const cityEl = document.createElement('span'); cityEl.className = 'ac-city'; cityEl.textContent = found.getLocalizationCityName();
      const areaEl = document.createElement('span'); areaEl.className = 'ac-area'; areaEl.textContent = new Area(found.areaID).getLocalizationAreaNamePrefixed();
      option.append(cityEl, areaEl);
    } else {
      const areaEl = document.createElement('span'); areaEl.className = 'ac-area is-area'; areaEl.textContent = found.getLocalizationAreaNamePrefixed();
      option.appendChild(areaEl);
    }
    option.onclick = () => { currentFocusIndex = index; onClickOption(); };
    autocomplete.appendChild(option);
  });

  document.querySelector('#selection .search-row').appendChild(autocomplete);
  currentFocusIndex = -1;
};

function updateFocus() {
  const options = document.querySelectorAll('#autocomplete button');
  options.forEach(n => n.classList.remove('focused'));
  if (currentFocusIndex === -1) { searchInput.focus(); return; }
  if (!options[currentFocusIndex]) return;
  options[currentFocusIndex].classList.add('focused');
  options[currentFocusIndex].scrollIntoView(false);
}

function onClickOption() {
  const sel = founds[currentFocusIndex];
  if (!sel) return;
  const existing = document.getElementById('autocomplete');
  if (existing) existing.remove();
  searchInput.value = '';
  if (sel instanceof City) {
    if (selectionCitiesIDs.includes(sel.id)) return;
    selectionCitiesIDs.push(sel.id);
    Preferences.saveSelectedCities(selectionCitiesIDs);
  } else {
    if (selectionAreaIDs.includes(sel.id)) return;
    selectionAreaIDs.push(sel.id);
    Preferences.saveSelectedAreas(selectionAreaIDs);
  }
  loadSelectionCitiesUI();
}

searchInput.onkeydown = function (e) {
  if (!document.getElementById('autocomplete')) return;
  switch (e.keyCode) {
    case 40: currentFocusIndex === founds.length - 1 ? (currentFocusIndex = 0) : currentFocusIndex++; break;
    case 38: currentFocusIndex === 0 ? (currentFocusIndex = -1) : currentFocusIndex--; break;
    case 13: e.preventDefault(); return onClickOption();
    default: return;
  }
  updateFocus();
};

searchInput.addEventListener('focusout', () =>
  setTimeout(() => { const ac = document.getElementById('autocomplete'); if (ac) ac.remove(); }, 200)
);
searchInput.onfocus = () => searchInput.dispatchEvent(new Event('input'));

document.getElementById('clear').onclick = () => {
  selectionCitiesIDs = []; selectionAreaIDs = [];
  Preferences.saveSelectedCities(selectionCitiesIDs);
  Preferences.saveSelectedAreas(selectionAreaIDs);
  loadSelectionCitiesUI();
};

function setSilentBoxEnabled(enabled) {
  silentNotSelectedBox.style.pointerEvents = enabled ? 'auto' : 'none';
  silentNotSelectedBox.style.opacity       = enabled ? '1'    : '0.5';
}

function loadSelectionCitiesUI() {
  const container = document.getElementById('selected');
  container.innerHTML = '';
  const hasSelection = selectionCitiesIDs.length > 0 || selectionAreaIDs.length > 0;
  setSilentBoxEnabled(hasSelection);

  allCities.filter(c => selectionCitiesIDs.includes(c.id)).forEach(c =>
    container.appendChild(buildChip(c.getLocalizationCityName(), false, () => {
      selectionCitiesIDs = selectionCitiesIDs.filter(id => id !== c.id);
      Preferences.saveSelectedCities(selectionCitiesIDs, loadSelectionCitiesUI);
    }))
  );

  allAreas.filter(a => selectionAreaIDs.includes(a.id)).forEach(a =>
    container.appendChild(buildChip(a.getLocalizationAreaNamePrefixed(), true, () => {
      selectionAreaIDs = selectionAreaIDs.filter(id => id !== a.id);
      Preferences.saveSelectedAreas(selectionAreaIDs, loadSelectionCitiesUI);
    }))
  );

  if (!container.children.length) {
    const empty = document.createElement('p');
    empty.className  = 'empty';
    empty.textContent = 'לא נבחרו אזורים — יתקבלו התרעות בכל הארץ.';
    container.appendChild(empty);
  }
}

function buildChip(name, isArea, onRemove) {
  const chip  = document.createElement('span');
  chip.className = 'chip' + (isArea ? ' is-area' : '');
  const x     = document.createElement('button');
  x.type = 'button'; x.className = 'chip-x'; x.textContent = '×'; x.onclick = onRemove;
  const label = document.createElement('span'); label.textContent = name;
  chip.append(x, label);
  return chip;
}

// ===== בורר צלילים =====
const soundSelect  = document.getElementById('soundSelect');
const previewSound = document.getElementById('previewSound');
let previewAudio   = null;

soundSelect.onchange  = () => Preferences.saveSelectedSound(soundSelect.value);
previewSound.onclick  = () => {
  if (previewAudio) { previewAudio.pause(); previewAudio = null; }
  previewAudio = new Audio('sounds/' + soundSelect.value + '.mp3');
  previewAudio.play().catch(() => {});
};

// ===== Switches + סוגי אירוע + בדיקה =====
const desktopNotifEl   = document.getElementById('desktopNotifications');
const silentNotSelEl   = document.getElementById('silentNotSelected');
const testAlertBtn     = document.getElementById('testAlert');
const eventTypeChips   = document.getElementById('eventTypeChips');

const EVENT_TYPE_IDS   = [3, 0, 2];
var selectedEventTypes = [];

desktopNotifEl.onchange = async () => {
  Preferences.saveSelectedDesktop(desktopNotifEl.checked);
  if (desktopNotifEl.checked && typeof Notification !== 'undefined' && Notification.permission === 'default') {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { desktopNotifEl.checked = false; Preferences.saveSelectedDesktop(false); }
  }
};

silentNotSelEl.onchange = () => Preferences.saveSilentNotSelected(silentNotSelEl.checked);
testAlertBtn.onclick    = () => triggerTestAlert();

// ניהול היסטוריה מקומית
const clearHistoryBtn   = document.getElementById('clearHistory');
const historyCountText  = document.getElementById('historyCountText');

function updateHistoryCount() {
  const count = getLocalHistory().length;
  if (historyCountText)
    historyCountText.textContent = count === 0
      ? 'אין פריטים שמורים מקומית.'
      : `${count} התרעות שמורות מקומית (בנוסף להיסטוריית השרת).`;
}

if (clearHistoryBtn) {
  clearHistoryBtn.onclick = () => {
    if (!confirm('למחוק את כל ההיסטוריה המקומית השמורה?')) return;
    clearLocalHistory();
    updateHistoryCount();
    loadHistory();
  };
}

function renderEventChips() {
  eventTypeChips.querySelectorAll('.filter-chip').forEach(chip => {
    chip.classList.toggle('selected', selectedEventTypes.includes(Number(chip.dataset.event)));
  });
}

eventTypeChips.querySelectorAll('.filter-chip').forEach(chip => {
  chip.onclick = () => {
    const id    = Number(chip.dataset.event);
    const isSel = selectedEventTypes.includes(id);
    if (isSel && selectedEventTypes.length === 1) return;
    selectedEventTypes = isSel
      ? selectedEventTypes.filter(x => x !== id)
      : [...selectedEventTypes, id];
    renderEventChips();
    Preferences.setSelectedEventTypes(selectedEventTypes.length === EVENT_TYPE_IDS.length ? [] : selectedEventTypes);
  };
});

// ===== מחוון חיבור =====
const connBtn     = document.getElementById('connBtn');
const connDot     = document.getElementById('connDot');
const connPopover = document.getElementById('connPopover');

function setConnUI(connected) {
  const text  = connected ? 'מחובר' : 'מנותק';
  connDot.classList.toggle('ok',   connected);
  connDot.classList.toggle('down', !connected);
  connBtn.classList.toggle('ok',   connected);
  connBtn.classList.toggle('down', !connected);
  connBtn.title = connected ? 'מחובר לשרת' : 'מנותק מהשרת';
  const connTextEl = document.getElementById('connText');
  if (connTextEl) connTextEl.textContent = text;
  const color = connected ? 'var(--ok)' : 'var(--danger)';
  connPopover.innerHTML     = `<span class="dot" style="background:${color}"></span>` + (connected ? 'מחובר לשרת' : 'מנותק מהשרת');
  connPopover.dataset.state = connected ? 'ok' : 'down';
}

connBtn.onclick = e => {
  e.stopPropagation();
  setConnUI(connectionStatus === 0);
  connPopover.hidden = !connPopover.hidden;
};
document.addEventListener('click', e => {
  if (!connPopover.hidden && !connPopover.contains(e.target) && e.target !== connBtn)
    connPopover.hidden = true;
});
setInterval(() => setConnUI(connectionStatus === 0), 5000);

// ===== טעינת הגדרות =====
async function loadSettings() {
  setConnUI(connectionStatus === 0);

  selectionCitiesIDs = await Preferences.getSelectedCities();
  selectionAreaIDs   = await Preferences.getSelectedAreas();
  loadSelectionCitiesUI();

  silentNotSelEl.checked  = await Preferences.getSilentNotSelected();
  desktopNotifEl.checked  = await Preferences.getSelectedDesktop();

  selectedEventTypes = await Preferences.getSelectedEventTypes();
  if (selectedEventTypes.length === 0) selectedEventTypes = [...EVENT_TYPE_IDS];
  renderEventChips();

  soundSelect.value = await Preferences.getSelectedSound();
  updateHistoryCount();
}
