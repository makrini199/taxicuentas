// Rehace las capturas de la ficha de Play Store: abre la app servida en local
// con datos de ejemplo inventados, fotografía cada pantalla y las compone
// sobre el fondo oscuro con su titular.
//
//   python3 -m http.server 8080     (en otra terminal, desde la raíz)
//   npm run capturas
//
// Salen en store/screenshots/ a 1080 × 1920, que es lo que pide Google.
// El navegador va en español a propósito: si no, las fechas de los campos
// <input type="date"> se dibujan en formato americano.

import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const BASE = process.env.BASE_URL || "http://127.0.0.1:8080";
const DEST = "store/screenshots";
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium";

// Un mes y medio de trabajo inventado. Días flojos, días buenos, domingos
// libres. Ninguna de estas cifras es de nadie.
const PERFIL = [
  [178.40, 62.10, 18.00, 41.30, 12.00, 0, 0, 34.20, 22.10, 48.60],
  [206.75, 84.50, 26.50, 38.90, 9.50, 22.40, 8.00, 41.60, 28.30, 62.15],
  [154.20, 51.80, 14.20, 29.70, 6.00, 0, 0, 28.40, 18.90, 39.80],
  [231.90, 96.30, 31.00, 52.40, 17.50, 31.20, 11.00, 47.80, 33.60, 71.40],
  [192.60, 73.40, 21.80, 44.10, 13.20, 18.90, 5.50, 38.20, 25.70, 55.30],
];
const MESES = [["2026-05", 26], ["2026-06", 24], ["2026-07", 26], ["2026-08", 21], ["2026-09", 15]];

const diasDeEjemplo = () => {
  const campos = ["taximetro", "uber", "uberEfec", "cabify", "cabifyEfec", "bolt", "boltEfec", "fnt9", "fncob", "visa"];
  const dias = {};
  for (const [ym, cuantos] of MESES) {
    let puestos = 0;
    for (let d = 1; d <= 31 && puestos < cuantos; d++) {
      const fecha = `${ym}-${String(d).padStart(2, "0")}`;
      const t = new Date(fecha + "T12:00:00");
      if (isNaN(t) || t.getMonth() !== Number(ym.slice(5)) - 1) continue;
      if (t.getDay() === 0) continue; // domingos libres
      dias[fecha] = Object.fromEntries(campos.map((c, i) => [c, PERFIL[puestos % PERFIL.length][i]]));
      puestos++;
    }
  }
  return dias;
};

const GASTOS = [
  { id: 1, date: "2026-09-02", concepto: "Combustible", importe: 318.40, reembolsable: false },
  { id: 2, date: "2026-09-04", concepto: "Taller", importe: 96.40, reembolsable: true },
  { id: 3, date: "2026-09-05", concepto: "Pinchazo", importe: 45.00, reembolsable: true },
  { id: 4, date: "2026-09-07", concepto: "Parking", importe: 18.00, reembolsable: false },
  { id: 5, date: "2026-09-09", concepto: "Lavado", importe: 12.50, reembolsable: true },
  { id: 6, date: "2026-09-10", concepto: "Multa", importe: 90.00, reembolsable: false },
  { id: 7, date: "2026-09-11", concepto: "ITV", importe: 52.30, reembolsable: true },
  { id: 8, date: "2026-09-13", concepto: "Combustible", importe: 302.15, reembolsable: false },
];

// [archivo, pestaña, cuánto bajar, titular, subtítulo]
const FICHAS = [
  ["01-diario", null, 0, "Apunta el día<br>en un minuto", "El taxímetro y cada app, en su casilla"],
  ["02-calculo", null, 620, "Sabe lo que<br>te toca a ti", "Tu parte, la de la empresa y el efectivo"],
  ["03-gastos", "Gastos", 600, "Lo que pones<br>de tu bolsillo", "Y lo que la empresa te tiene que devolver"],
  ["04-calendario", "Calendario", 0, "El mes entero<br>de un vistazo", "Los días buenos se ven solos"],
  ["05-mensual", "Mensual", 0, "Mira cómo<br>va el mes", "Y compáralo con los anteriores"],
  ["06-periodo", "Periodo", 0, "El periodo<br>que tú quieras", "Una semana, del 1 al 22, lo que necesites"],
  ["07-ajustes", "Ajustes", 0, "Tu acuerdo,<br>no el de otro", "Tu porcentaje y tu incentivo los pones tú"],
  ["08-apps", "Ajustes", 672, "Solo las apps<br>que tú uses", "Y si trabajas con otra, la añades tú"],
];

const marco = (titular, sub, dataUri) => `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8">
<link rel="stylesheet" href="${BASE}/fonts/dmsans.css">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{
    width:360px;height:640px;overflow:hidden;
    font-family:'DM Sans',system-ui,sans-serif;background:#0c0e13;
    background-image:
      radial-gradient(120% 60% at 50% -10%, rgba(224,184,60,.13) 0%, rgba(224,184,60,0) 60%),
      linear-gradient(170deg,#12141b 0%,#0a0c11 100%);
    display:flex;flex-direction:column;align-items:center;
  }
  h1{margin-top:36px;text-align:center;color:#fff;font-size:21px;font-weight:800;line-height:1.14;letter-spacing:-.45px}
  .rule{width:30px;height:2.5px;border-radius:2px;background:#e0b83c;margin:11px 0 9px}
  p{color:#99a0b2;font-size:10.5px;font-weight:500;text-align:center;padding:0 26px;line-height:1.4}
  .frame{margin-top:13px;width:273px;border-radius:13px;overflow:hidden;background:#fff;
         box-shadow:0 18px 44px rgba(0,0,0,.55),0 0 0 1px rgba(255,255,255,.07)}
  .frame img{display:block;width:100%}
</style></head>
<body><h1>${titular}</h1><div class="rule"></div><p>${sub}</p>
<div class="frame"><img src="${dataUri}"></div></body></html>`;

const navegador = await chromium.launch({
  executablePath: CHROMIUM,
  args: ["--lang=es-ES", "--hide-scrollbars"],
  env: { ...process.env, LANG: "es_ES.UTF-8", LANGUAGE: "es_ES:es", LC_ALL: "es_ES.UTF-8", LC_TIME: "es_ES.UTF-8" },
});
const ctx = await navegador.newContext({
  viewport: { width: 360, height: 640 },
  deviceScaleFactor: 3,
  locale: "es-ES",
  timezoneId: "Europe/Madrid",
  isMobile: true,
  hasTouch: true,
});
const p = await ctx.newPage();
p.on("pageerror", (e) => { console.error("error en la página:", e.message); process.exitCode = 1; });

await p.goto(`${BASE}/index.html`, { waitUntil: "load" });
await p.waitForSelector("text=INGRESOS DEL DÍA");
await p.evaluate(([dias, gastos]) => {
  localStorage.clear();
  localStorage.setItem("tc_days", JSON.stringify(dias));
  localStorage.setItem("tc_gastos", JSON.stringify(gastos));
  localStorage.setItem("tc_notas", JSON.stringify({ "2026-09-19": "Concierto Bernabéu, salir a las 22h", "2026-09-24": "Revisión del coche" }));
  localStorage.setItem("tc_cfg", JSON.stringify({ pctConductor: 50, incentivo: "combustible", umbral: "6000", bonoImporte: "", pctCombustible: "50",
    plataformas: [{ key: "uber", activa: true }, { key: "cabify", activa: true }, { key: "bolt", activa: false }, { key: "fnt9", activa: true }] }));
  localStorage.setItem("tc_cfg_ok", "true");
}, [diasDeEjemplo(), GASTOS]);
await p.reload({ waitUntil: "load" });
await p.waitForSelector("text=INGRESOS DEL DÍA");
await p.waitForTimeout(1200);

// La fecha del día, sin dejar el campo enfocado: el anillo dorado y el texto
// seleccionado en azul se colarían en la captura.
await p.locator("input[type=date]").first().fill("2026-09-15");
await p.waitForTimeout(500);
await p.evaluate(() => document.activeElement && document.activeElement.blur());
await p.waitForTimeout(400);

await mkdir(DEST, { recursive: true });
for (const [nombre, pestana, bajar, titular, sub] of FICHAS) {
  if (pestana === "Ajustes") {
    await p.getByLabel("Ajustes").click();   // el de la cabecera, no el enlace del parte
    await p.waitForTimeout(900);
  } else if (pestana) {
    await p.getByRole("button", { name: new RegExp(pestana) }).click();
    await p.waitForTimeout(900);
  }
  await p.evaluate((v) => { document.body.scrollTop = v; document.documentElement.scrollTop = v; }, bajar);
  await p.waitForTimeout(500);
  const crudo = await p.screenshot();
  await p.setContent(marco(titular, sub, `data:image/png;base64,${crudo.toString("base64")}`), { waitUntil: "load" });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${DEST}/${nombre}.jpg`, type: "jpeg", quality: 92 });
  console.log(`${DEST}/${nombre}.jpg`);
  // setContent nos ha sacado de la app; volvemos para la siguiente.
  await p.goto(`${BASE}/index.html`, { waitUntil: "load" });
  await p.waitForSelector("text=INGRESOS DEL DÍA");
  await p.waitForTimeout(700);
  await p.locator("input[type=date]").first().fill("2026-09-15");
  await p.evaluate(() => document.activeElement && document.activeElement.blur());
  await p.waitForTimeout(400);
}

await navegador.close();
console.log(`\n${FICHAS.length} capturas a 1080 × 1920.`);
