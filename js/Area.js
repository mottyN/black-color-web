class Area {
  constructor(areaID, cityValue) {
    this.id = Number(areaID)
    this.areaID = Number(areaID);
    var item = City.CITIES_JSON["areas"][areaID];
    if (!item) {
      this.areaHE = cityValue;
      this.areaEN = cityValue;
      this.areaES = cityValue;
      this.areaAR = cityValue;
      this.areaRU = cityValue;
    } else {
      this.areaHE = item.he;
      this.areaEN = item.en;
      this.areaES = item.es;
      this.areaAR = item.ar;
      this.areaRU = item.ru;
    }
  }

  getLocalizationAreaName() {
    switch (City.siteLanguage) {
      case "EN":
        return this.areaEN;
      case "ES":
        return this.areaES;
      case "AR":
        return this.areaAR;
      case "RU":
        return this.areaRU;
      default:
        return this.areaHE;
    }
  }


  getLocalizationAreaNamePrefixed() {
    switch (City.siteLanguage) {
      case "EN":
        return this.areaEN + " area";
      case "ES":
        return this.areaES + " area";
      case "AR":
        return "المنطقة" + this.areaAR;
      case "RU":
        return "района "+ this.areaRU;
      default:
        return "אזור "+ this.areaHE;
    }
  }

  
  
}
