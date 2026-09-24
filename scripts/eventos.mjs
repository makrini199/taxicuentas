// Repasa eventos.json antes de subirlo. Un archivo roto deja a todo el mundo
// sin días marcados, así que más vale que salte aquí.
//
//   npm run eventos
import { readFile } from "node:fs/promises";

const TIPOS = ["fiesta", "futbol", "concierto", "feria", "ocio", "deporte"];
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const SALIDA = /^([01]\d|2[0-3]):[0-5]\d(\s*[-–]\s*([01]\d|2[0-3]):[0-5]\d)?$/;
const MAX_DIAS = 15;   // lo que dura una feria larga; más es una errata
const D = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

const fallos = [];
const avisos = [];
const falla = (i, m) => fallos.push(`evento ${i + 1}: ${m}`);
const real = (f) => FECHA.test(f) && !Number.isNaN(Date.parse(f + "T00:00:00Z")) && new Date(f + "T00:00:00Z").toISOString().slice(0, 10) === f;
const diaSemana = (f) => D[(new Date(f + "T00:00:00Z").getUTCDay() + 6) % 7];

let datos;
try {
  datos = JSON.parse(await readFile("eventos.json", "utf8"));
} catch (e) {
  console.error("eventos.json no se puede leer:", e.message);
  process.exit(1);
}

if (!real(datos.actualizado || "")) fallos.push('falta "actualizado" con una fecha AAAA-MM-DD');
if (!Array.isArray(datos.eventos)) {
  console.error('eventos.json: "eventos" tiene que ser una lista');
  process.exit(1);
}

const vistos = new Map();
datos.eventos.forEach((e, i) => {
  if (!e || typeof e !== "object") return falla(i, "no es un objeto");
  if (!real(e.fecha)) return falla(i, `fecha inválida: ${JSON.stringify(e.fecha)}`);
  if (typeof e.titulo !== "string" || !e.titulo.trim()) return falla(i, "sin título");
  if (e.titulo.length > 60) falla(i, `título de ${e.titulo.length} caracteres, no caben más de 60`);
  if (e.tipo !== undefined && !TIPOS.includes(e.tipo)) falla(i, `tipo "${e.tipo}" desconocido (${TIPOS.join(", ")})`);
  if (e.nota !== undefined && String(e.nota).length > 160) falla(i, "nota de más de 160 caracteres");
  if (e.hora !== undefined && !HORA.test(e.hora)) falla(i, `hora "${e.hora}" inválida; va como 21:00`);
  if (e.salida !== undefined && !SALIDA.test(e.salida)) falla(i, `salida "${e.salida}" inválida; va como 23:00-00:00, o solo 01:00`);
  if (e.hasta !== undefined) {
    if (!real(e.hasta)) return falla(i, `"hasta" inválido: ${JSON.stringify(e.hasta)}`);
    if (e.hasta < e.fecha) return falla(i, '"hasta" es anterior a "fecha"');
    const dias = (Date.parse(e.hasta) - Date.parse(e.fecha)) / 86400000 + 1;
    if (dias > MAX_DIAS) falla(i, `dura ${dias} días; ¿seguro que no es una errata?`);
  }
  const clave = `${e.fecha} · ${e.titulo.trim().toLowerCase()}`;
  if (vistos.has(clave)) falla(i, `repetido, ya está en el evento ${vistos.get(clave) + 1}`);
  else vistos.set(clave, i);
});

const hoy = new Date().toISOString().slice(0, 10);
const futuros = datos.eventos.filter((e) => real(e?.fecha) && (e.hasta || e.fecha) >= hoy).sort((a, b) => a.fecha.localeCompare(b.fecha));
if (!futuros.length) avisos.push("no queda ningún evento por venir: el calendario ya no le dice nada a nadie");
const ultimo = datos.eventos.map((e) => e?.hasta || e?.fecha).filter(real).sort().pop();
if (ultimo && (Date.parse(ultimo) - Date.parse(hoy)) / 86400000 < 30) avisos.push(`el último evento es el ${ultimo}: quedan menos de 30 días de calendario`);

if (fallos.length) {
  console.error("\neventos.json tiene fallos:\n" + fallos.map((f) => "  · " + f).join("\n") + "\n");
  process.exit(1);
}

console.log(`eventos.json · ${datos.eventos.length} eventos, ${futuros.length} por venir · actualizado el ${datos.actualizado}`);
for (const e of futuros.slice(0, 40)) {
  const rango = e.hasta && e.hasta !== e.fecha ? ` → ${e.hasta}` : "";
  const horas = e.salida ? `  · salida ${e.salida}` : e.hora ? `  · a las ${e.hora}` : "";
  console.log(`  ${e.fecha}${rango}  ${diaSemana(e.fecha).padEnd(10)} ${e.titulo}${horas}`);
}
for (const a of avisos) console.log("\naviso: " + a);
