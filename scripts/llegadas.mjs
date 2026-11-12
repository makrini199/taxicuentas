// Llegadas a Barajas, a mano: pide los vuelos a AeroDataBox (o convierte una
// respuesta ya guardada) y los deja en el formato que lee la pantalla
// «Llegadas al aeropuerto». Sirve para probar; en producción esto mismo lo
// hace la función del servidor, supabase/functions/llegadas.
//
//   RAPIDAPI_KEY=…  node scripts/llegadas.mjs > salida.json       pide a la API
//   node scripts/llegadas.mjs respuesta-cruda.json > salida.json    convierte un archivo
//
// Cada petición cubre 12 horas y gasta 2 unidades de la cuota de AeroDataBox.
//
// OJO: las condiciones de AeroDataBox no dejan publicar sus datos como un
// archivo que cualquiera pueda descargar. La salida de este script NO se sube
// a la web de la app.
import { readFileSync } from "node:fs";
import { convertir, urlLlegadas, HOST_VUELOS } from "../supabase/functions/llegadas/convertir.mjs";

const pedir = async () => {
  const clave = process.env.RAPIDAPI_KEY;
  if (!clave) throw new Error("Falta RAPIDAPI_KEY (o pasa un archivo con la respuesta cruda).");
  const res = await fetch(urlLlegadas(), { headers: { "X-RapidAPI-Key": clave, "X-RapidAPI-Host": HOST_VUELOS } });
  if (!res.ok) throw new Error(`AeroDataBox respondió ${res.status}: ${(await res.text()).slice(0, 200)}`);
  console.error(`unidades que quedan este mes: ${res.headers.get("x-ratelimit-api-units-remaining")}`);
  return res.json();
};

const archivo = process.argv[2];
const crudo = archivo ? JSON.parse(readFileSync(archivo, "utf8")) : await pedir();
const salida = convertir(crudo);
console.error(`${salida.vuelos.length} llegadas`);
process.stdout.write(JSON.stringify(salida) + "\n");
