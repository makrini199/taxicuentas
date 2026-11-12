// De la respuesta de AeroDataBox al formato que lee la pantalla «Llegadas al
// aeropuerto». Lo usan la función del servidor y scripts/llegadas.mjs.

// Las ciudades llegan en inglés o con el nombre del municipio del aeropuerto.
// Aquí van, por código de aeropuerto, las que un conductor de Madrid diría de
// otra manera. Las demás se dejan como vienen.
const CIUDADES = {
  LHR: "Londres", LGW: "Londres", STN: "Londres", LTN: "Londres", LCY: "Londres", SEN: "Londres",
  CDG: "París", ORY: "París", BVA: "París (Beauvais)", FCO: "Roma", CIA: "Roma", MXP: "Milán", LIN: "Milán", BGY: "Milán (Bérgamo)",
  ATH: "Atenas", FRA: "Fráncfort", MUC: "Múnich", GVA: "Ginebra", BRU: "Bruselas", CRL: "Bruselas (Charleroi)", AMS: "Ámsterdam",
  LIS: "Lisboa", OPO: "Oporto", DUB: "Dublín", EDI: "Edimburgo", CPH: "Copenhague", ARN: "Estocolmo", VIE: "Viena", ZRH: "Zúrich",
  PRG: "Praga", WAW: "Varsovia", KRK: "Cracovia", BUD: "Budapest", OTP: "Bucarest", IST: "Estambul", SAW: "Estambul", CAI: "El Cairo",
  DXB: "Dubái", AUH: "Abu Dabi", JFK: "Nueva York", EWR: "Nueva York", MEX: "Ciudad de México", PTY: "Panamá", GRU: "São Paulo",
  SCL: "Santiago de Chile", TFN: "Tenerife Norte", TFS: "Tenerife Sur", LPA: "Gran Canaria", ACE: "Lanzarote", FUE: "Fuerteventura",
  SPC: "La Palma", PMI: "Palma de Mallorca", IBZ: "Ibiza", MAH: "Menorca", LCG: "A Coruña", EAS: "San Sebastián", XRY: "Jerez",
  BSL: "Basilea", VCE: "Venecia", NAP: "Nápoles", FLR: "Florencia", TRN: "Turín", BLQ: "Bolonia", HAM: "Hamburgo", BER: "Berlín",
  CGN: "Colonia", NCE: "Niza", MRS: "Marsella", LYS: "Lyon", BOD: "Burdeos", PEK: "Pekín", PKX: "Pekín", CMN: "Casablanca",
  TNG: "Tánger", ALG: "Argel", HEL: "Helsinki", BEG: "Belgrado", SOF: "Sofía", JED: "Yeda", HAV: "La Habana", SVO: "Moscú",
  LED: "San Petersburgo", TLV: "Tel Aviv", AMM: "Amán", RUH: "Riad", DEL: "Nueva Delhi", NRT: "Tokio", HND: "Tokio", ICN: "Seúl",
  PVG: "Shanghái", LUX: "Luxemburgo", MLA: "Malta", GOT: "Gotemburgo", ZAG: "Zagreb", LJU: "Liubliana", TIA: "Tirana",
  XCR: "París (Vatry)", GRO: "Girona", VLC: "Valencia", SVQ: "Sevilla", AGP: "Málaga", ALC: "Alicante", BIO: "Bilbao", OVD: "Asturias",
  SDR: "Santander", VGO: "Vigo", PNA: "Pamplona", LEI: "Almería", GRX: "Granada", MJV: "Murcia", RMU: "Murcia", VIT: "Vitoria",
  XPL: "Tegucigalpa", SAP: "San Pedro Sula", MDE: "Medellín", CLO: "Cali", TLS: "Toulouse", SXB: "Estrasburgo", LCA: "Lárnaca",
  LAX: "Los Ángeles", GDN: "Gdansk",
  SCQ: "Santiago de Compostela", BCN: "Barcelona", ZAZ: "Zaragoza", BJZ: "Badajoz", MLN: "Melilla", RJL: "Logroño", LEN: "León",
};

// "2026-11-12 11:25Z" → "2026-11-12T11:25:00Z"
const aIso = (t) => {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::\d{2})?Z$/.exec(t && t.utc ? t.utc : "");
  return m ? `${m[1]}T${m[2]}:00Z` : "";
};

export const convertir = (crudo, ahora = Date.now()) => {
  const vuelos = [];
  for (const v of (crudo && Array.isArray(crudo.arrivals) ? crudo.arrivals : [])) {
    if (!v || v.isCargo || !v.arrival) continue;
    // Un vuelo con varias compañías sale repetido: solo cuenta la que lo opera.
    if (v.codeshareStatus && v.codeshareStatus !== "IsOperator" && v.codeshareStatus !== "Unknown") continue;
    const hora = aIso(v.arrival.scheduledTime);
    if (!hora) continue;
    const prevista = aIso(v.arrival.runwayTime) || aIso(v.arrival.revisedTime) || hora;
    const estado = /^cancel/i.test(v.status || "") || v.status === "Diverted" ? "cancelado" : "";
    const ap = (v.departure && v.departure.airport) || {};
    vuelos.push({
      hora, prevista,
      terminal: v.arrival.terminal ? `T${String(v.arrival.terminal).toUpperCase().replace(/^T/, "")}` : "",
      origen: CIUDADES[ap.iata] || ap.name || "",
      num: String(v.number || "").replace(/\s+/g, ""),
      cia: (v.airline && v.airline.name) || "",
      estado,
    });
  }
  vuelos.sort((a, b) => a.prevista.localeCompare(b.prevista));
  return { actualizado: new Date(ahora).toISOString().replace(/\.\d+Z$/, "Z"), vuelos };
};

// La hora de Madrid en el formato que pide la API: 2026-11-12T12:30
export const horaMadrid = (ms) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
};

export const HOST_VUELOS = "aerodatabox.p.rapidapi.com";
// Desde hace 40 minutos, para tener también los que acaban de aterrizar. Entre
// las dos horas no puede haber más de 12 horas.
export const urlLlegadas = (ahora = Date.now(), aeropuerto = "LEMD") =>
  `https://${HOST_VUELOS}/flights/airports/icao/${aeropuerto}/${horaMadrid(ahora - 40 * 60000)}/${horaMadrid(ahora + (11 * 60 + 15) * 60000)}?direction=Arrival&withLeg=true&withCancelled=true&withCodeshared=false&withCargo=false&withPrivate=false&withLocation=false`;
