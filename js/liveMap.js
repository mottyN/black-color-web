/*
  liveMap.js — מפה חיה בעמוד הראשי.
  מציגה אירועים פעילים בזמן אמת עם נעצים מבהבים.
*/

var liveMap = null;
var liveMarkers = {};

function initLiveMap() {
  if (liveMap) return;
  const container = document.getElementById('liveMapContainer');
  if (!container) return;

  // Leaflet דורש שהקונטיינר יהיה גלוי ועם גובה לפני האתחול
  requestAnimationFrame(() => {
    liveMap = L.map('liveMapContainer', {
      zoomControl: false,
      attributionControl: true,
    }).setView([31.5, 34.85], 7);

    liveMap.attributionControl.setPrefix('');
    liveMap.attributionControl.setPosition('bottomleft');

    // טיילס כהים (CartoDB Dark Matter)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap © CARTO',
    }).addTo(liveMap);

    L.control.zoom({ position: 'bottomright' }).addTo(liveMap);

    // חיוני: Leaflet לא תמיד מחשב גודל נכון בטעינה
    setTimeout(() => liveMap.invalidateSize(), 200);
  });
}

function getLivePinColor(eventType) {
  if (eventType === 0 || eventType === 2) return '#ffd500';
  if (eventType === 3) return '#ff8c40';
  return '#aab0c4';
}

function updateLiveMapMarkers(cities) {
  if (!liveMap) initLiveMap();

  const seen = new Set();
  const bounds = L.latLngBounds();
  let hasLocations = false;

  cities.forEach(c => {
    const lat = Number(c.lat), lng = Number(c.lng);
    if (!lat && !lng) return;
    const key = c.notificationId || `${lat},${lng}`;
    seen.add(key);
    bounds.extend([lat, lng]);
    hasLocations = true;

    if (liveMarkers[key]) return; // כבר קיים

    const color = getLivePinColor(c.eventType);
    const icon = L.divIcon({
      className: '',
      html: `
        <div class="live-pin-wrap">
          <div class="live-pin-pulse" style="background:${color}"></div>
          <div class="live-pin-core" style="background:${color}">
            ${eventIconSvg(c.eventType, 14)}
          </div>
        </div>`,
      iconSize:   [40, 40],
      iconAnchor: [20, 20],
    });

    const name = c.cityHE || c.value || '';
    const marker = L.marker([lat, lng], { icon })
      .addTo(liveMap)
      .bindTooltip(name, { permanent: false, direction: 'top', className: 'live-tooltip' });

    liveMarkers[key] = marker;
  });

  // מסיר נעצים של אירועים שנגמרו
  Object.keys(liveMarkers).forEach(key => {
    if (!seen.has(key)) {
      liveMap.removeLayer(liveMarkers[key]);
      delete liveMarkers[key];
    }
  });

  // זום לאירועים פעילים
  if (hasLocations && bounds.isValid()) {
    const count = Object.keys(liveMarkers).length;
    if (count === 1) liveMap.setView(bounds.getCenter(), 13, { animate: true });
    else             liveMap.fitBounds(bounds, { padding: [60, 60], maxZoom: 13, animate: true });
  }

  setLiveMapStatus(cities.length > 0, cities);
}

function clearLiveMapMarkers() {
  Object.values(liveMarkers).forEach(m => liveMap && liveMap.removeLayer(m));
  liveMarkers = {};

  // חזרה לתצוגת כל ישראל
  if (liveMap) liveMap.setView([31.5, 34.85], 7, { animate: true });

  setLiveMapStatus(false, []);
}

function setLiveMapStatus(isActive, cities) {
  const statusEl = document.getElementById('liveMapStatus');
  const textEl   = document.getElementById('liveMapStatusText');
  const banner   = document.getElementById('activeBanner');
  if (!statusEl || !textEl) return;

  if (isActive && cities.length > 0) {
    const titles = [...new Set(cities.map(c => City.getLocalizationEventTypeTitle(c.eventType)))];
    const names  = [...new Set(cities.map(c => c.cityHE || c.value || ''))].slice(0, 3).join(' · ');

    statusEl.className = 'map-status active';
    textEl.textContent = `${titles.join(' | ')} — ${names}`;

    if (banner) {
      banner.textContent = `🔴 ${titles.join(' | ')} — ${names}`;
      banner.hidden = false;
    }
  } else {
    statusEl.className = 'map-status idle';
    textEl.textContent = 'אין אירועים פעילים כרגע';
    if (banner) banner.hidden = true;
  }
}
