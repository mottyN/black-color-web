/*
  alertMap.js — גרסת אתר (GitHub Pages).
  הוסרו כל קריאות ל-chrome.runtime / chrome.storage.
  closeAlertOverlay() מוגדרת ב-app.js (נקראת מ-showEndedFlash).
*/
var map;
var isMapLoaded = false;
var nowCities = [];
var mapMouseDown = false;

// ===== אתחול מפה + כפתור מרחק (נקרא פעם אחת כשה-overlay נפתח) =====
document.addEventListener('DOMContentLoaded', () => {
  const distBtn = document.getElementById('distance');
  if (distBtn) distBtn.addEventListener('click', onDistanceClick);
});

// ===== רינדור מנתוני היסטוריה (query-params style) =====
function renderFromParams(params) {
  const eventType = Number(params.get('eventType'));
  const city      = params.get('city')    || '';
  const address   = params.get('address') || '';
  const note      = params.get('note')    || '';
  const lat = params.has('lat') ? Number(params.get('lat')) : undefined;
  const lng = params.has('lng') ? Number(params.get('lng')) : undefined;

  const hasLoc = typeof lat === 'number' && !Number.isNaN(lat) &&
                 typeof lng === 'number' && !Number.isNaN(lng) && (lat || lng);
  nowCities = hasLoc ? [{ eventType, lat, lng, notificationId: 'history' }] : [];

  document.getElementById('eventTitle').textContent   = City.getLocalizationEventTypeTitle(eventType);
  document.getElementById('locationText').textContent = address ? `${city}, ${address}` : city;

  const noteEl = document.getElementById('alertNote');
  if (note) { noteEl.textContent = note; noteEl.hidden = false; }
  else        noteEl.hidden = true;

  // איפוס banner סיום
  endedFlashShown = false;
  document.getElementById('eventEndedBanner').hidden = true;
  document.getElementById('distanceBar').hidden = true;

  if (isMapLoaded) { addMarkers(nowCities); invalidateMap(); }
}

// ===== עדכון מאירוע חי =====
async function alertsListener(cities) {
  cities = cities.map(c => {
    const city = new City(c.value, c.eventType, c.expireAt, c.timestamp);
    city.note    = c.note    || '';
    city.address = c.address || '';
    if (typeof c.lat === 'number') city.lat = c.lat;
    if (typeof c.lng === 'number') city.lng = c.lng;
    return city;
  });
  nowCities = cities;

  const titles = [];
  cities.forEach(c => {
    const t = City.getLocalizationEventTypeTitle(c.eventType);
    if (!titles.includes(t)) titles.push(t);
  });
  document.getElementById('eventTitle').textContent = titles.join(' | ');

  const locations = cities.map(c =>
    c.address ? `${c.getLocalizationCityName()}, ${c.address}` : c.getLocalizationCityName()
  );
  document.getElementById('locationText').textContent = locations.join(' · ');

  const noteEl = document.getElementById('alertNote');
  const notes = [];
  cities.forEach(c => { if (c.note && !notes.includes(c.note)) notes.push(c.note); });
  if (notes.length) { noteEl.textContent = notes.join(' · '); noteEl.hidden = false; }
  else              { noteEl.textContent = ''; noteEl.hidden = true; }

  // איפוס banner סיום לאירוע חי חדש
  endedFlashShown = false;
  document.getElementById('eventEndedBanner').hidden = true;

  if (isMapLoaded) { addMarkers(cities); invalidateMap(); }
}

// ===== הבהוב "האירוע הסתיים" =====
let endedFlashShown = false;
function showEndedFlash() {
  if (endedFlashShown) return;
  endedFlashShown = true;
  const banner = document.getElementById('eventEndedBanner');
  banner.textContent = 'האירוע הסתיים';
  banner.hidden = false;
  setTimeout(() => {
    if (typeof closeAlertOverlay === 'function') closeAlertOverlay();
    endedFlashShown = false;
  }, 8000);
}

// ===== צבע נעץ לפי סוג אירוע =====
function getColorForEventType(t) {
  if (t === 0 || t === 2) return '#ffd500';
  if (t === 3) return '#ff8000';
  return '#c9cbd6';
}

// ===== נעצים על המפה =====
const markers = {};
function addMarkers(cities) {
  const bounds = L.latLngBounds();
  const seen   = new Set();

  cities.forEach(c => {
    if (!c.lat && !c.lng) return;
    const key = c.notificationId || `${c.lat},${c.lng}`;
    seen.add(key);
    bounds.extend([c.lat, c.lng]);
    if (markers[key]) { markers[key].setLatLng([c.lat, c.lng]); return; }
    const color = getColorForEventType(c.eventType);
    const icon  = L.divIcon({
      className: '',
      html: `<div class="bc-pin" style="background:${color}">${eventIconSvg(c.eventType, 18)}</div>`,
      iconSize:   [34, 34],
      iconAnchor: [17, 33],
    });
    markers[key] = L.marker([c.lat, c.lng], { icon }).addTo(map);
  });

  Object.keys(markers).forEach(key => {
    if (!seen.has(key)) { map.removeLayer(markers[key]); delete markers[key]; }
  });

  if (bounds.isValid() && !mapMouseDown) {
    const pts = Object.keys(markers).length;
    if (pts <= 1) map.setView(bounds.getCenter(), 16);
    else          map.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 });
  }
}

// ===== טעינת המפה (lazy — כשה-overlay נפתח) =====
function loadMap() {
  if (isMapLoaded) return;
  map = L.map('map', { zoomControl: false }).setView([31.5469501, 34.6863132], 8);
  map.attributionControl.setPrefix('');
  map.attributionControl.setPosition('bottomleft');
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap',
  }).addTo(map);
  map.on('mousedown', () => (mapMouseDown = true));
  map.on('mouseup',   () => (mapMouseDown = false));
  isMapLoaded = true;
  if (nowCities.length) addMarkers(nowCities);
}

// leaflet מחייב invalidateSize אחרי שה-container הופיע לראשונה
function invalidateMap() {
  if (map) setTimeout(() => map.invalidateSize(), 50);
}

// ===== "מרחק מהמיקום שלי" =====
let userMarker   = null;
let distanceLine = null;
let distState    = { air: null, car: undefined, walk: undefined };

const LOCATION_CACHE_KEY  = 'alertLocationCache';
const LOCATION_FRESH_MS   = 30 * 60 * 1000;
let lastKnownLocation = null;

function getCachedLocation() {
  try { const v = localStorage.getItem(LOCATION_CACHE_KEY); return Promise.resolve(v ? JSON.parse(v) : null); }
  catch { return Promise.resolve(null); }
}
function saveCachedLocation(loc) {
  try { localStorage.setItem(LOCATION_CACHE_KEY, JSON.stringify(loc)); } catch {}
}
function locationFresh(c) {
  return !!(c && Array.isArray(c.coords) && typeof c.ts === 'number' && Date.now() - c.ts < LOCATION_FRESH_MS);
}

function STR(name) {
  try { return STRINGS[name][(City.siteLanguage || 'HE').toLowerCase()] || STRINGS[name].he; }
  catch { return ''; }
}

function eventPoint() {
  for (const c of nowCities) {
    const lat = Number(c.lat), lng = Number(c.lng);
    if ((lat || lng) && !Number.isNaN(lat) && !Number.isNaN(lng)) return [lat, lng];
  }
  return null;
}

function haversineKm(a, b) {
  const R = 6371, toRad = d => d * Math.PI / 180;
  const dLat = toRad(b[0]-a[0]), dLng = toRad(b[1]-a[1]);
  const s = Math.sin(dLat/2)**2 + Math.cos(toRad(a[0]))*Math.cos(toRad(b[0]))*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.sqrt(s));
}

function fmtDist(km) {
  if (km == null || Number.isNaN(km)) return '—';
  return km < 1 ? `${Math.round(km*1000)} מ׳` : `${km.toFixed(1)} ק״מ`;
}
function fmtDur(sec) {
  const m = Math.round(sec/60);
  if (m < 1)  return 'פחות מדקה';
  if (m < 60) return `${m} דק׳`;
  const h = Math.floor(m/60), mm = m%60;
  return mm ? `${h} ש׳ ${mm} דק׳` : `${h} ש׳`;
}

async function fetchRoute(costing, from, to) {
  const body = { locations: [{lat:from[0],lon:from[1]},{lat:to[0],lon:to[1]}], costing, units:'kilometers' };
  const url  = 'https://valhalla1.openstreetmap.de/route?json=' + encodeURIComponent(JSON.stringify(body));
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 7000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    const s = data?.trip?.summary;
    if (!s || typeof s.length !== 'number') throw new Error('no summary');
    return { km: s.length, sec: s.time };
  } catch { return null; }
  finally   { clearTimeout(timer); }
}

function renderDistance() {
  const bar  = document.getElementById('distanceBar');
  const seg  = [`${STR('distanceAir')}: ${fmtDist(distState.air)}`];
  const part = (label, v) => {
    if (v === undefined) return `${label}: …`;
    if (v === null)      return null;
    return `${label}: ${fmtDist(v.km)} (${fmtDur(v.sec)})`;
  };
  const car  = part(STR('distanceCar'),  distState.car);
  const walk = part(STR('distanceWalk'), distState.walk);
  if (car)  seg.push(car);
  if (walk) seg.push(walk);
  bar.textContent = seg.join('  ·  ');
  bar.hidden = false;
}

function drawUser(me, target) {
  if (!isMapLoaded) return;
  if (userMarker)   map.removeLayer(userMarker);
  if (distanceLine) map.removeLayer(distanceLine);
  const icon = L.divIcon({
    className: '',
    html: `<div class="bc-userpin" title="${STR('youAreHere')}"></div>`,
    iconSize: [24, 24], iconAnchor: [12, 12],
  });
  userMarker   = L.marker(me, { icon }).addTo(map);
  distanceLine = L.polyline([me, target], { color: '#4c8dff', weight: 3, dashArray: '6 7', opacity: 0.9 }).addTo(map);
  map.fitBounds(L.latLngBounds([me, target]), { padding: [44, 44], maxZoom: 16 });
}

function showFromLocation(me, target) {
  drawUser(me, target);
  distState = { air: haversineKm(me, target), car: undefined, walk: undefined };
  renderDistance();
  fetchRoute('auto',       me, target).then(r => { distState.car  = r; renderDistance(); });
  fetchRoute('pedestrian', me, target).then(r => { distState.walk = r; renderDistance(); });
}

async function onDistanceClick() {
  const bar    = document.getElementById('distanceBar');
  const btn    = document.getElementById('distance');
  const target = eventPoint();

  if (!target)                  { bar.hidden = false; bar.textContent = STR('distanceNoEventLoc'); return; }
  if (!navigator.geolocation)   { bar.hidden = false; bar.textContent = STR('distanceGeoError');   return; }

  bar.hidden = false;
  let shownCoords = null;
  const cached = lastKnownLocation || (await getCachedLocation());
  if (locationFresh(cached)) {
    lastKnownLocation = cached;
    shownCoords = cached.coords;
    showFromLocation(cached.coords, target);
  } else {
    bar.textContent = STR('distanceComputing');
  }

  btn.classList.add('loading');
  navigator.geolocation.getCurrentPosition(
    pos => {
      btn.classList.remove('loading');
      const me = [pos.coords.latitude, pos.coords.longitude];
      lastKnownLocation = { coords: me, ts: Date.now() };
      saveCachedLocation(lastKnownLocation);
      if (!shownCoords || haversineKm(shownCoords, me) > 0.05) showFromLocation(me, target);
    },
    () => {
      btn.classList.remove('loading');
      if (!shownCoords) { bar.hidden = false; bar.textContent = STR('distanceGeoError'); }
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
  );
}
