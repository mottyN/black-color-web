/*
  Preferences.js — גרסת אתר (GitHub Pages).
  מחליף chrome.storage.sync ב-localStorage.
  ממשק זהה לתוסף (Promises, callbacks) — שאר הקבצים לא שונו.
*/
class Preferences {
  static _get(key, def) {
    try {
      const v = localStorage.getItem(key);
      return v !== null ? JSON.parse(v) : def;
    } catch { return def; }
  }
  static _set(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  }

  static async getSelectedSound() { return this._get('selectedSound', 'bell2'); }
  static saveSelectedSound(id, cb = () => {}) { this._set('selectedSound', id); cb(); }

  static async getSelectedCities() { return this._get('selectedCities', []); }
  static saveSelectedCities(ids, cb = () => {}) { this._set('selectedCities', ids); cb(); }

  static async getSelectedAreas() { return this._get('selectedAreas', []); }
  static saveSelectedAreas(ids, cb = () => {}) { this._set('selectedAreas', ids); cb(); }

  static async getSelectedEventTypes() { return this._get('selectedEventTypes', []); }
  static setSelectedEventTypes(val, cb = () => {}) { this._set('selectedEventTypes', val); cb(); }

  static async getSelectedDesktop() { return this._get('desktopNotifications', false); }
  static saveSelectedDesktop(val, cb = () => {}) { this._set('desktopNotifications', val); cb(); }

  static async getSilentNotSelected() { return this._get('silentNotSelected', false); }
  static saveSilentNotSelected(val, cb = () => {}) { this._set('silentNotSelected', val); cb(); }

  // לא רלוונטי לאתר — מחזיר ברירות מחדל בלבד
  static async getSelectedBackgroundHidePopup() { return false; }
  static saveSelectedBackgroundHidePopup(val, cb = () => {}) { cb(); }
  static async getPreventFrequentPopupFocus() { return false; }
  static savePreventFrequentPopupFocus(val, cb = () => {}) { cb(); }

  static async getCitiesVersion() { return this._get('citiesVersion', 0); }
  static async setCitiesVersion(value) {
    const current = await Preferences.getCitiesVersion();
    if (value > current) this._set('citiesVersion', value);
  }

  static async getPolygonsVersion() { return this._get('polygonsVersion', 0); }
  static async setPolygonsVersion(value) {
    const current = await Preferences.getPolygonsVersion();
    if (value > current) this._set('polygonsVersion', value);
  }

  static audio;
  static async playSound(ids, eventType) { return Preferences.startPlaying(); }
  static async startPlaying() {
    const sound = await Preferences.getSelectedSound();
    Preferences.audio?.pause();
    Preferences.audio = new Audio('sounds/' + sound + '.mp3');
    return Preferences.audio.play().catch(() => {});
  }

  static getDateString(date, shortYear = false) {
    const d = ('0' + date.getDate()).slice(-2);
    const m = ('0' + (date.getMonth() + 1)).slice(-2);
    const y = shortYear ? date.getYear().toString().substr(1, 2) : date.getFullYear();
    return d + '/' + m + '/' + y;
  }
  static getTimeString(date, minutesOnly = false) {
    const h = date.getHours().toString().padStart(2, '0');
    const m = date.getMinutes().toString().padStart(2, '0');
    const s = date.getSeconds().toString().padStart(2, '0');
    return h + ':' + m + (minutesOnly ? '' : ':' + s);
  }
  static getDateTimeString(date, minutesOnly = false) {
    return Preferences.getDateString(date) + ' ' + Preferences.getTimeString(date, minutesOnly);
  }
  static getRelativeTimeString(date1, date2 = new Date()) {
    const units = {
      year: 24*60*60*1000*365, month: (24*60*60*1000*365)/12, week: 24*60*60*1000*7,
      day: 24*60*60*1000, hour: 60*60*1000, minute: 60*1000, second: 1000,
    };
    const rtf = new Intl.RelativeTimeFormat((City.siteLanguage || 'HE').toLowerCase(), { numeric: 'auto' });
    const passed = date2 - date1;
    if (passed <= units.minute) return 'כעת';
    if (passed > units.day) { date1.setHours(0,0,0,0); date2.setHours(0,0,0,0); }
    const elapsed = date1 - date2;
    for (var u in units)
      if (Math.abs(elapsed) >= units[u] || u === 'second')
        return rtf.format(Math.round(elapsed / units[u]), u);
  }

  static sortCitiesByEventType(cities) {
    var sortedList = {};
    cities.forEach(city => {
      var cityName = city.getLocalizationCityName();
      var areaName = new Area(city.areaID, cityName).getLocalizationAreaName();
      var key = String(city.eventType);
      if (!sortedList[key]) sortedList[key] = {};
      if (!sortedList[key][areaName]) sortedList[key][areaName] = [];
      sortedList[key][areaName].push(cityName);
    });
    return sortedList;
  }

  static generateAlertMessage(alertCities, siteLanguage) {
    const dates = {};
    var list = {};
    alertCities.forEach(c => (list[String(c.eventType)] = {}));
    alertCities.forEach(c => {
      const key = String(c.eventType);
      list[key][c.timestamp] = [].concat(list[key][c.timestamp] || [], c);
      const ds = Preferences.getDateString(new Date(c.timestamp * 1000));
      dates[ds] = ds;
    });
    var text = '';
    Object.keys(list).forEach(k => {
      text += City.getLocalizationEventTypeTitle(Number(k)) + ` (${Object.values(dates).join(' - ')}):\n\n`;
      Object.keys(list[k]).forEach(ts => {
        text += Preferences.getTimeString(new Date(Number(ts) * 1000)) + ':\n';
        const areas = Preferences.sortCitiesByEventType(list[k][ts])[k];
        text += Object.keys(areas).map(a => `• ${a}: ${areas[a].join(', ')}`).join('\n') + '\n\n';
      });
      text += '------------\n\n';
    });
    text += 'באמצעות אתר צבע שחור\n' + SERVER_BASE_URL;
    return text;
  }

  // תמיד עברית (עיצוב מחודש — אין בורר שפה)
  static async getSelectedLanguage() { City.siteLanguage = 'HE'; return 'HE'; }
  static saveSelectedLanguage(code, cb = () => {}) { City.siteLanguage = code; cb(); }

  static async copyAlert(cities = null) {
    const lang = await Preferences.getSelectedLanguage();
    const text = Preferences.generateAlertMessage(cities || [], lang);
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta);
      ta.focus(); ta.select(); document.execCommand('copy'); ta.remove();
    }
  }

  static getSystemsPageUrl() { return SERVER_BASE_URL; }
  static async launchSiteMap() {}
}
