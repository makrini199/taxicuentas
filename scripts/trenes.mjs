// Llegadas de tren a Madrid: de los horarios abiertos de Renfe (GTFS de alta
// velocidad, larga y media distancia) saca qué trenes llegan a Atocha y a
// Chamartín cada día, y lo deja en trenes.json, que va junto a la app.
//
//   1. Bajar https://ssl.renfe.com/gtransit/Fichero_AV_LD/google_transit.zip
//      (ficha: https://data.renfe.com/dataset/horarios-de-alta-velocidad-larga-distancia-y-media-distancia)
//   2. Descomprimirlo en una carpeta
//   3. node scripts/trenes.mjs <carpeta> > trenes.json
//
// Licencia de los datos: Creative Commons Attribution 4.0 (hay que citar a Renfe).
// Son horarios programados: no llevan retrasos, ni los trenes de Iryo y Ouigo.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const DIAS = 35;   // cuántos días, desde hoy, lleva el archivo
// Las estaciones de Madrid que interesan al taxi y cómo las llama el conductor.
const ESTACIONES = { "60000": "Atocha", "18000": "Atocha", "17000": "Chamartín" };
// Las ciudades, como se dicen en la calle.
const CIUDADES = { "Alicante/Alacant": "Alicante", "Marseille St Charles": "Marsella", "Murcia del Carmen": "Murcia", "Málaga María Zambrano": "Málaga", "Vigo Urzaiz": "Vigo", "Vigo Guixar": "Vigo", "Zaragoza Delicias": "Zaragoza", Irun: "Irún", Alacant: "Alicante", "València": "Valencia", "Castelló": "Castellón", "Castelló de la Plana": "Castellón", Donostia: "San Sebastián", Iruña: "Pamplona", "Pamplona/Iruña": "Pamplona", "Vitoria/Gasteiz": "Vitoria", Gasteiz: "Vitoria", Bilbao: "Bilbao", "Bilbao-Abando Indalecio Prieto": "Bilbao", Elx: "Elche", Xàtiva: "Játiva", Lleida: "Lérida", Girona: "Gerona", Ourense: "Orense", "A Coruña": "A Coruña" };

// CSV sencillo, con comillas. Las cabeceras de Renfe traen espacios de relleno.
const leer = (carpeta, nombre) => {
  const texto = readFileSync(join(carpeta, nombre), "utf8").replace(/^﻿/, "");
  const filas = [];
  let campo = "", fila = [], dentro = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (dentro) { if (c === '"') { if (texto[i + 1] === '"') { campo += '"'; i++; } else dentro = false; } else campo += c; }
    else if (c === '"') dentro = true;
    else if (c === ",") { fila.push(campo.trim()); campo = ""; }
    else if (c === "\n") { fila.push(campo.trim()); filas.push(fila); fila = []; campo = ""; }
    else if (c !== "\r") campo += c;
  }
  if (campo || fila.length) { fila.push(campo.trim()); filas.push(fila); }
  const cab = filas.shift();
  return filas.filter((f) => f.length > 1).map((f) => Object.fromEntries(cab.map((k, i) => [k, f[i] ?? ""])));
};

const carpeta = process.argv[2];
if (!carpeta) { console.error("Uso: node scripts/trenes.mjs <carpeta con el GTFS de Renfe descomprimido>"); process.exit(1); }

const iso = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
const hoyMadrid = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
const dia0 = new Date(hoyMadrid + "T00:00:00Z");
const fechas = Array.from({ length: DIAS }, (_, i) => iso(new Date(dia0.getTime() + i * 86400000)));
const indice = new Map(fechas.map((f, i) => [f, i]));
const compacta = (f) => f.replace(/-/g, "");

const paradas = new Map(leer(carpeta, "stops.txt").map((s) => [s.stop_id, s.stop_name]));
const rutas = new Map(leer(carpeta, "routes.txt").map((r) => [r.route_id, r.route_short_name]));
const viajes = new Map(leer(carpeta, "trips.txt").map((t) => [t.trip_id, t]));

// Qué días circula cada servicio dentro de la ventana.
const SEMANA = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const circula = new Map();
for (const c of leer(carpeta, "calendar.txt")) {
  const dias = new Set();
  for (const f of fechas) { const n = compacta(f); if (n >= c.start_date && n <= c.end_date && c[SEMANA[new Date(f + "T00:00:00Z").getUTCDay()]] === "1") dias.add(f); }
  circula.set(c.service_id, dias);
}
for (const e of leer(carpeta, "calendar_dates.txt")) {
  const f = `${e.date.slice(0, 4)}-${e.date.slice(4, 6)}-${e.date.slice(6, 8)}`;
  if (!indice.has(f)) continue;
  if (!circula.has(e.service_id)) circula.set(e.service_id, new Set());
  if (e.exception_type === "1") circula.get(e.service_id).add(f); else circula.get(e.service_id).delete(f);
}

// Las paradas de cada viaje, en orden.
const porViaje = new Map();
for (const s of leer(carpeta, "stop_times.txt")) {
  if (!porViaje.has(s.trip_id)) porViaje.set(s.trip_id, []);
  porViaje.get(s.trip_id).push({ sec: Number(s.stop_sequence), parada: s.stop_id, llega: s.arrival_time });
}

const ciudad = (nombre) => { const n = String(nombre || "").trim(); if (CIUDADES[n]) return CIUDADES[n]; const corto = n.split("-")[0].trim(); return CIUDADES[corto] || corto; };
// Un mismo tren puede venir partido en varios viajes (por tramos): cuenta una
// sola vez, con el origen del viaje más largo.
const trenes = new Map();   // estación|hora|tipo|número → { origen, paradas, dias }
for (const [id, lista] of porViaje) {
  const v = viajes.get(id); if (!v) continue;
  const dias = circula.get(v.service_id); if (!dias || !dias.size) continue;
  lista.sort((a, b) => a.sec - b.sec);
  const origen = ciudad(paradas.get(lista[0].parada));
  if (origen === "Madrid") continue;   // sale de Madrid: no es una llegada
  const visto = new Set();
  for (let i = 1; i < lista.length; i++) {
    const est = ESTACIONES[lista[i].parada]; if (!est || visto.has(est)) continue;
    const m = /^(\d{1,2}):(\d{2})/.exec(lista[i].llega); if (!m) continue;
    visto.add(est);
    const h = Number(m[1]), salto = Math.floor(h / 24);   // 25:10 es la 1:10 del día siguiente
    const hora = `${String(h % 24).padStart(2, "0")}:${m[2]}`;
    const clave = [est === "Atocha" ? "A" : "C", hora, rutas.get(v.route_id) || "", v.trip_short_name || id].join("|");
    if (!trenes.has(clave)) trenes.set(clave, { origen, paradas: i, dias: new Array(DIAS).fill("0") });
    const t = trenes.get(clave);
    if (i > t.paradas) { t.origen = origen; t.paradas = i; }
    for (const f of dias) { const k = indice.get(f) + salto; if (k >= 0 && k < DIAS) t.dias[k] = "1"; }
  }
}

const salida = {
  actualizado: hoyMadrid, desde: fechas[0], dias: DIAS, fuente: "Renfe · CC BY 4.0",
  // [estación (A = Atocha, C = Chamartín), hora, origen, tipo de tren, número, días que circula desde «desde»]
  trenes: [...trenes].filter(([, t]) => t.dias.includes("1")).map(([k, t]) => { const [est, hora, tipo, num] = k.split("|"); return [est, hora, t.origen, tipo, num, t.dias.join("")]; }).sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0])),
};
console.error(`${salida.trenes.length} trenes distintos, del ${fechas[0]} al ${fechas[DIAS - 1]}`);
process.stdout.write(JSON.stringify(salida) + "\n");
