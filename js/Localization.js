var DRILLS_THREAT_ID = 9;

// כותרות סוגי האירוע (eventType) — מחליפות את שמות האיומים. ר' SPEC §4.4.
// עברית מיושרת לתוויות ה-dispatcher (types.ts) — מקור האמת לניסוח.
var EVENT_TYPE_TITLES = {
  he: { 0: "נסיון מעצר מ.צ.", 2: "התרעת מחסומים", 3: "נסיון הסגרה", 8: "התראה" },
  en: { 0: "MP arrest attempt", 2: "Checkpoints alert", 3: "Extradition attempt", 8: "Alert" },
};

// סמל ייעודי לכל סוג אירוע — inline SVG בקו דק (outline, currentColor), ללא מילוי.
// משותף לחלונית (היסטוריה) ולחלון ההתראה (נעץ במפה). ר' SPEC §6.6.
function eventIconSvg(type, size = 22) {
  const paths = {
    // נסיון מעצר מ.צ. — מגן + סימן קריאה
    0: '<path d="M12 3l7 3v5c0 4.6-3 7.6-7 9-4-1.4-7-4.4-7-9V6z"/><path d="M12 9v3.2"/><path d="M12 15.4h.01"/>',
    // התרעת מחסומים — מחסום-דרך (קורה + עמודים)
    2: '<rect x="3.5" y="8.5" width="17" height="3.5" rx="1"/><path d="M6 12v8.5"/><path d="M18 12v8.5"/><path d="M7 9l4 3M11 9l4 3M15 9l3 2.2"/>',
    // נסיון הסגרה — אזיקים (שתי טבעות + חוליית שרשרת)
    3: '<circle cx="6.5" cy="15" r="4"/><circle cx="17.5" cy="15" r="4"/><path d="M10.4 14h3.2"/><path d="M10.4 16h3.2"/>',
    // התראה כללית — פעמון
    8: '<path d="M18 8.5a6 6 0 10-12 0c0 6.5-2.5 8.5-2.5 8.5h17S18 15 18 8.5z"/><path d="M13.7 20.5a2 2 0 01-3.4 0"/>',
  };
  const inner = paths[type] != null ? paths[type] : paths[8];
  return (
    `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" ` +
    `fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
    inner +
    "</svg>"
  );
}

var STRINGS = {
  /* App */
  appName: {
    he: "צבע שחור - תוסף קהילתי",
    en: "Tzeva Shachor - Community Extension",
  },

  /* Popup */
  now: {
    he: "כעת",
    en: "now",
  },
  noHistory: {
    he: "אין עדיין היסטוריית אירועים",
    en: "No event history yet",
  },
  eventEnded: {
    he: "האירוע הסתיים",
    en: "Event ended",
  },

  /* Alert.html */
  copyButton: {
    he: "העתקת התרעה",
    en: "Copy Alert",
  },
  openMapButton: {
    he: "פתיחת מפה",
    en: "Open Map",
  },

  /* Alert.html — מרחק מהמיקום שלי */
  distanceButton: {
    he: "מרחק מהמיקום שלי",
    en: "Distance from me",
  },
  distanceComputing: {
    he: "מאתר את מיקומך…",
    en: "Locating you…",
  },
  distanceAir: {
    he: "מרחק אווירי",
    en: "Air distance",
  },
  distanceCar: {
    he: "ברכב",
    en: "Driving",
  },
  distanceWalk: {
    he: "ברגל",
    en: "Walking",
  },
  distanceGeoError: {
    he: "לא ניתן לאתר את מיקומך",
    en: "Couldn't get your location",
  },
  distanceNoEventLoc: {
    he: "אין מיקום מדויק לאירוע זה",
    en: "No precise location for this event",
  },
  youAreHere: {
    he: "המיקום שלך",
    en: "Your location",
  },
};

STRINGS.sentVia = {
  he: `באמצעות תוסף "${STRINGS.appName.he}" לכרום.`,
  en: `Using "${STRINGS.appName.en}" for Chrome.`,
};

window.addEventListener("load", async (event) => {
  const siteLanguage = await Preferences.getSelectedLanguage();
  document.querySelectorAll("*").forEach((e) => {
    Array.from(e.childNodes)
      .filter((child) => child.nodeType == Node.TEXT_NODE && /{(.*)}/.test(child.textContent))
      .forEach(
        (textNode) => (textNode.textContent = replaceStrings(textNode.textContent, siteLanguage))
      );

    Array.from(e.attributes)
      .filter((attr) => /{(.*)}/.test(attr.value))
      .map((attr) => (attr.value = replaceStrings(attr.value, siteLanguage)));
  });
  document.title = replaceStrings(document.title, siteLanguage);
  fixLTR(siteLanguage);
});

function fixLTR(siteLanguage) {
  if (siteLanguage == "HE" || siteLanguage == "AR") return;
  const style = document.createElement("style");
  style.textContent = `
    html, body {
      direction: ltr !important;
    }

    #selection input {
      margin-right: unset;
      margin-left: 5px;
      background-position: right center;
    }

    #selection .item {
      margin-left: unset;
      margin-right: 4px;
    }

    .history_item .date {
      text-align: left !important;
    }

    #map::before {
      background-image: linear-gradient(to left, rgba(169, 162, 162, 0), #cd363487, #cd3634db, #cd3634) !important;
    }

    #map.drill::before {
      background-image: linear-gradient(to left, rgba(169, 162, 162, 0),#5772fc8a, #5772fcdb, #5772fc) !important;
    }

    #Sounds input:not(#readCities) {
      margin-left: 40% !important;
    }

    input {
      margin-right: 5px !important;
    }

    #logo {
      right: 10px;
      left: unset !important;
    }

    #Home #alertDetails {
      margin-right: 0 !important;
      margin-left: -20px !important;
    }

    #close {
      left: 15px !important;
      right: unset !important;
      rotate: 180deg;
    }

    #openInBrowser {
      right: 15px !important;
      left: unset !important;
    }
  `;
  if (siteLanguage != "RU")
    style.textContent += ` .tablink:first-of-type {
      min-width: 150px !important;
    }`
  document.head.append(style);
}

function replaceStrings(htmlText, siteLanguage) {
  return htmlText.replaceAll(/\{(.*?)\}/g, (all, stringName) => {
    var localizationString;
    try {
      localizationString =
        STRINGS[stringName][siteLanguage?.toLowerCase()] || STRINGS[stringName]["he"];
    } catch (error) {}
    return localizationString != null ? localizationString : all;
  });
}
