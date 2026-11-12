// Llegadas a Barajas: pide los vuelos a AeroDataBox y los deja en el formato
// que lee la pantalla «Llegadas al aeropuerto» de la app.
//
//   RAPIDAPI_KEY=…  node scripts/llegadas.mjs > salida.json     pide a la API
//   node scripts/llegadas.mjs respuesta-cruda.json > salida.json  convierte un archivo
//
// Cada petición cubre 12 horas y gasta 2 unidades de la cuota de AeroDataBox.
//
// OJO: las condiciones de AeroDataBox no dejan publicar sus datos como un
// archivo que cualquiera pueda descargar. La salida de este script NO se sube
// a la web de la app: es para el servidor, que es de donde la leerá la app.
import { readFileSync } from "node:fs";

const HOST = "aerodatabox.p.rapidapi.com";
const AEROPUERTO = "LEMD";

// "2026-11-12 11:25Z" → "2026-11-12T11:25:00Z"
const aIso = (t) => {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::\d{2})?Z$/.exec(t && t.utc ? t.utc : "");
  return m ? `${m[1]}T${m[2]}:00Z` : "";
};

// La hora de Madrid en el formato que pide la API: 2026-11-12T12:30
const horaMadrid = (ms) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
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
    vuelos.push({
      hora, prevista,
      terminal: v.arrival.terminal ? `T${String(v.arrival.terminal).toUpperCase().replace(/^T/, "")}` : "",
      origen: (v.departure && v.departure.airport && v.departure.airport.name) || "",
      num: String(v.number || "").replace(/\s+/g, ""),
      cia: (v.airline && v.airline.name) || "",
      estado,
    });
  }
  vuelos.sort((a, b) => a.prevista.localeCompare(b.prevista));
  return { actualizado: new Date(ahora).toISOString().replace(/\.\d+Z$/, "Z"), vuelos };
};

const pedir = async () => {
  const clave = process.env.RAPIDAPI_KEY;
  if (!clave) throw new Error("Falta RAPIDAPI_KEY (o pasa un archivo con la respuesta cruda).");
  const ahora = Date.now();
  // Desde hace 40 minutos, para tener también los que acaban de aterrizar.
  const desde = horaMadrid(ahora - 40 * 60000), hasta = horaMadrid(ahora + (11 * 60 + 15) * 60000);
  const url = `https://${HOST}/flights/airports/icao/${AEROPUERTO}/${desde}/${hasta}?direction=Arrival&withLeg=true&withCancelled=true&withCodeshared=false&withCargo=false&withPrivate=false&withLocation=false`;
  const res = await fetch(url, { headers: { "X-RapidAPI-Key": clave, "X-RapidAPI-Host": HOST } });
  if (!res.ok) throw new Error(`AeroDataBox respondió ${res.status}: ${(await res.text()).slice(0, 200)}`);
  console.error(`unidades que quedan este mes: ${res.headers.get("x-ratelimit-api-units-remaining")}`);
  return res.json();
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const archivo = process.argv[2];
  const crudo = archivo ? JSON.parse(readFileSync(archivo, "utf8")) : await pedir();
  const salida = convertir(crudo);
  console.error(`${salida.vuelos.length} llegadas`);
  process.stdout.write(JSON.stringify(salida) + "\n");
}
