const { useState, useMemo, useEffect, useRef } = React;
const APP_VERSION = "__APP_VERSION__";
const fmt = (n) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(n);
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmt0 = (n) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
const todayStr = () => ymd(new Date());
const shiftDays = (s, n) => { const [y, m, d] = s.split("-").map(Number); return ymd(new Date(y, m - 1, d + n)); };
const weekStart = (s) => { const [y, m, d] = s.split("-").map(Number); return ymd(new Date(y, m - 1, d - ((new Date(y, m - 1, d).getDay() + 6) % 7))); };
const monthStart = (s) => s.slice(0, 8) + "01";
const dayMonth = (s) => s.slice(8) + "/" + s.slice(5, 7);
const WD = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
const weekday = (s) => { const [y, m, d] = s.split("-").map(Number); return WD[(new Date(y, m - 1, d).getDay() + 6) % 7]; };
const daysBetween = (lo, hi) => { const out = []; for (let d = lo; d <= hi && out.length < 62; d = shiftDays(d, 1)) out.push(d); return out; };
const monthKey = (d) => d.slice(0, 7);
const monthLabel = (ym) => { const [y, m] = ym.split("-"); return new Date(y, m - 1).toLocaleDateString("es-ES", { month: "long", year: "numeric" }); };
const capitalizar = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const diasEnMes = (ym) => { const [y, m] = ym.split("-").map(Number); return new Date(y, m, 0).getDate(); };
const primerDiaSemana = (ym) => { const [y, m] = ym.split("-").map(Number); return (new Date(y, m - 1, 1).getDay() + 6) % 7; };
const mesVecino = (ym, n) => { const [y, m] = ym.split("-").map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const monthShort = (ym) => { const [y, m] = ym.split("-"); return new Date(y, m - 1).toLocaleDateString("es-ES", { month: "short" }); };
// Las plataformas que vienen de serie. Las claves (uber, uberEfec, fnt9...) son
// las que llevan años guardadas en los días de la gente: no se tocan nunca.
// El nombre sí puede cambiar, y al vivir aquí el cambio le llega a todo el mundo.
//
// tipo dice qué significa la segunda casilla:
//   "efectivo" → lo que el conductor se cobró en mano; la empresa se queda el resto
//   "cobrado"  → lo que ya cobró la empresa; el resto se lo quedó el conductor
// La T9 es una tarifa de Madrid, no una aplicación: los viajes de FreeNow con
// taxímetro ya van contados en la casilla del taxi.
const PLATAFORMAS_BASE = [
  { key: "uber", cobKey: "uberEfec", nombre: "Uber", tipo: "efectivo", base: true },
  { key: "cabify", cobKey: "cabifyEfec", nombre: "Cabify", tipo: "efectivo", base: true },
  { key: "bolt", cobKey: "boltEfec", nombre: "Bolt", tipo: "efectivo", base: true },
  { key: "fnt9", cobKey: "fncob", nombre: "FreeNow \u00b7 precio cerrado", tipo: "cobrado", base: true },
];
// Los cálculos recorren TODAS las plataformas, también las apagadas: si alguien
// deja de trabajar con Bolt, sus meses de Bolt tienen que seguir cuadrando.
const calcDay = (d, pct = 50, plats = PLATAFORMAS_BASE) => {
  const n = (v) => Number(v) || 0;
  let apps = 0;
  let empresa = n(d.visa);
  for (const p of plats) {
    const total = n(d[p.key]);
    apps += total;
    empresa += p.tipo === "cobrado" ? n(d[p.cobKey]) : total - n(d[p.cobKey]);
  }
  const facturacion = n(d.taximetro) + apps;
  const conductor50 = facturacion * (pct / 100);
  return { facturacion, conductor50, cobradoEmpresa: empresa, diferencia: conductor50 - empresa };
};
const CONCEPTOS = ["Combustible", "Pinchazo", "ITV", "Lavado", "Taller", "Multa", "Parking", "Otros"];
const gastoValido = (g) => g && typeof g === "object" && /^\d{4}-\d{2}-\d{2}$/.test(g.date) && Number(g.importe) > 0;
// Los repostajes se guardaban aparte; pasan a ser un gasto más, con su concepto.
const loadGastos = () => {
  const guardados = loadStorage("tc_gastos", null);
  if (Array.isArray(guardados)) return guardados.filter(gastoValido);
  const viejos = loadStorage("tc_fuel", []);
  return (Array.isArray(viejos) ? viejos : [])
    .filter((e) => e && e.date && Number(e.importe) > 0)
    .map((e, i) => ({ id: e.id || Date.now() + i, date: e.date, concepto: "Combustible", importe: Number(e.importe), reembolsable: false }));
};
const sumarGastos = (lista, desde, hasta) => lista.reduce((a, g) => {
  if (g.date < desde || g.date > hasta) return a;
  const v = Number(g.importe) || 0;
  a.total += v;
  if (g.reembolsable) a.reembolsable += v;
  if (g.concepto === "Combustible") a.combustible += v;
  return a;
}, { total: 0, reembolsable: 0, combustible: 0 });
const finDeMes = (ym) => ym + "-31";
const DEFAULT_CFG = { objetivos: { dia: "", semana: "", mes: "" }, pctConductor: 50, incentivo: "ninguno", umbral: "", bonoImporte: "", pctCombustible: "", plataformas: [] };
// Deja la lista siempre completa y en orden: las cuatro de serie primero, con el
// interruptor que tuviera cada una, y detrás las que haya añadido el conductor.
// Quien nunca haya pasado por Ajustes las tiene las cuatro encendidas, que es
// como funcionaba la app antes de que esto se pudiera elegir.
const normPlataformas = (lista) => {
  const guardadas = Array.isArray(lista) ? lista.filter((p) => p && typeof p.key === "string") : [];
  const suyas = new Map(guardadas.map((p) => [p.key, p]));
  const deSerie = PLATAFORMAS_BASE.map((p) => ({ ...p, activa: suyas.has(p.key) ? suyas.get(p.key).activa !== false : true }));
  const propias = guardadas
    .filter((p) => !PLATAFORMAS_BASE.some((b) => b.key === p.key))
    .map((p) => ({
      key: p.key,
      cobKey: typeof p.cobKey === "string" && p.cobKey ? p.cobKey : p.key + "b",
      nombre: String(p.nombre || "Sin nombre").slice(0, 24),
      tipo: p.tipo === "cobrado" ? "cobrado" : "efectivo",
      base: false,
      activa: p.activa !== false,
    }));
  return [...deSerie, ...propias];
};
const nuevaPlataforma = (nombre, tipo) => { const key = "p" + Date.now().toString(36); return { key, cobKey: key + "b", nombre: nombre.trim().slice(0, 24), tipo: tipo === "cobrado" ? "cobrado" : "efectivo", base: false, activa: true }; };
// Objetivos de facturación de cada día, semana y mes. Se guardan con el acuerdo,
// así que viajan en la copia de seguridad.
const normObjetivos = (o) => Object.fromEntries(["dia", "semana", "mes"].map((k) => { const n = Number(o && o[k]); return [k, Number.isFinite(n) && n > 0 ? String(Math.round(n * 100) / 100) : ""]; }));
const loadCfg = () => { const g = loadStorage("tc_cfg", {}); return { ...DEFAULT_CFG, ...g, plataformas: normPlataformas(g && g.plataformas), objetivos: normObjetivos(g && g.objetivos) }; };
const num = (v) => Number(v) || 0;
const incentivoDe = (cfg, totalFact, combustible) => { const meta = num(cfg.umbral); const llega = totalFact >= meta; if (cfg.incentivo === "bono") { const importe = num(cfg.bonoImporte); if (meta <= 0 || importe <= 0) return { tipo: "incompleto", llega: false, importe: 0 }; return { tipo: "bono", llega, importe: llega ? importe : 0, etiqueta: `Bono al superar ${fmt0(meta)}`, pendiente: `Faltan ${fmt(Math.max(0, meta - totalFact))} para el bono de ${fmt0(importe)}`, logrado: `¡Superados los ${fmt0(meta)}! Bono de ${fmt0(importe)} desbloqueado` }; } if (cfg.incentivo === "combustible") { const pc = num(cfg.pctCombustible); if (meta <= 0 || pc <= 0) return { tipo: "incompleto", llega: false, importe: 0 }; return { tipo: "combustible", llega, importe: llega ? combustible * (pc / 100) : 0, etiqueta: `${pc}% del combustible`, pendiente: `Faltan ${fmt(Math.max(0, meta - totalFact))} para que te paguen el ${pc}% del combustible`, logrado: `¡Superados los ${fmt0(meta)}! Te pagan el ${pc}% del combustible` }; } return { tipo: "ninguno", llega: false, importe: 0 }; };
const summarize = (entries, pct = 50, plats = PLATAFORMAS_BASE) => { let acum = 0; const rows = entries.map(([date, d]) => { const s = calcDay(d, pct, plats); acum += s.facturacion; return { date, s, acumFact: acum }; }); const conductor = acum * (pct / 100); const cobrado = rows.reduce((a, r) => a + r.s.cobradoEmpresa, 0); const efectivo = rows.reduce((a, r) => a + (r.s.facturacion - r.s.cobradoEmpresa), 0); const dias = rows.length; const jornada = { min: 0, diasConHoras: 0, ganadoConHoras: 0, carreras: 0, factConCarreras: 0, propinas: 0 };
  entries.forEach(([, d], i) => { const s = rows[i].s; const min = minutosJornada(d); const prop = propinasDe(d); const car = carrerasDe(d); jornada.propinas += prop; if (car) { jornada.carreras += car; jornada.factConCarreras += s.facturacion; } if (min) { jornada.min += min; jornada.diasConHoras++; jornada.ganadoConHoras += s.conductor50 + prop; } });
  return { rows, totalFact: acum, conductorMes: conductor, totalCobradoEmpresa: cobrado, diferenciaMes: conductor - cobrado, efectivoMes: efectivo, diasTrabajados: dias, mediaDiaria: dias ? acum / dias : 0, jornada }; };
const clavesDia = (plats) => ["taximetro", "visa", ...plats.flatMap((p) => [p.key, p.cobKey])];
const EMPTY = { taximetro: 0, uber: 0, uberEfec: 0, cabify: 0, cabifyEfec: 0, bolt: 0, boltEfec: 0, fnt9: 0, fncob: 0, visa: 0 };
const EFEC_TRIOS = [["uber", "uberEfec", "uberCob"], ["cabify", "cabifyEfec", "cabifyCob"], ["bolt", "boltEfec", "boltCob"]];
const today = todayStr();
const loadStorage = (key, fallback) => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } };
// Cada casilla de dinero es una calculadora: "10,65+8,40" son 19,05. Así el que
// apunta viaje a viaje va sumando sobre la marcha y el que mete el total del día
// lo mete sin más. Acepta coma o punto, y un "-" para corregir un viaje mal puesto.
const evalSuma = (v) => {
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
  if (typeof v !== "string") return 0;
  const partes = v.replace(/\s/g, "").replace(/,/g, ".").match(/[+-]?[^+-]+/g) || [];
  const total = partes.reduce((a, t) => a + (parseFloat(t) || 0), 0);
  return Math.round(total * 100) / 100;
};
const viajesDe = (v) => (String(v).replace(/\s/g, "").match(/[+-]?[^+-]+/g) || []).map((t, i) => { const menos = t[0] === "-"; const n = t.replace(/^[+-]/, "").replace(/\./g, ","); return i === 0 ? (menos ? `−${n}` : n) : `${menos ? "−" : "+"} ${n}`; }).join(" ");
const limpiarCasilla = (v) => String(v).replace(/[^\d.,+\-]/g, "");
const hasData = (d) => !!d && typeof d === "object" && (Object.values(d).some((v) => (Number(v) || 0) !== 0) || minutosJornada(d) > 0);
const migrateDay = (d) => { const out = { ...d }; for (const [fact, efec, oldCob] of EFEC_TRIOS) { if (out[efec] === undefined) { const total = Number(out[fact]) || 0; const cobrado = out[oldCob] === undefined ? total : Number(out[oldCob]) || 0; out[efec] = Math.max(0, total - cobrado); } delete out[oldCob]; } return out; };
const loadDays = () => Object.fromEntries(Object.entries(loadStorage("tc_days", {})).filter(([, d]) => hasData(d)).map(([date, d]) => [date, migrateDay(d)]));

// Mucha gente llega por el enlace que corre por WhatsApp y se queda usando la
// web dentro del navegador que WhatsApp abre por su cuenta: sin icono en el
// móvil y sin contar como instalación en Play Console. El aviso de abajo los
// empuja a instalarse la app, y solo se pinta cuando toca.
//
// Mientras la app esté en prueba cerrada este enlace tiene que ser el de
// alta de probadores: desde la ficha de la tienda no la pueden instalar si
// antes no han aceptado la invitación. Al pasar a producción, cambiar por
// https://play.google.com/store/apps/details?id=com.txpro.cuentas
const PLAY_URL = "https://play.google.com/apps/testing/com.txpro.cuentas";
const AVISO_PLAY_KEY = "tc_aviso_play";
const AVISO_PLAY_DIAS = 7;
// La app instalada carga esta misma web por dentro, así que hay que mirar tres
// cosas: el modo de ventana (PWA y TWA), el standalone de Safari y el referrer
// que Android pone al arrancar la app. Si cualquiera dice que sí, no es la web.
const enAppInstalada = () => {
  try {
    if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) return true;
    if (window.navigator.standalone === true) return true;
    if (typeof document.referrer === "string" && document.referrer.startsWith("android-app://")) return true;
  } catch {}
  return false;
};
// Solo en Android: en iPhone no hay nada que instalar desde Play Store.
const esAndroid = () => { try { return /Android/i.test(navigator.userAgent || ""); } catch { return false; } };
const avisoPlaySilenciado = () => { const t = loadStorage(AVISO_PLAY_KEY, 0); return typeof t === "number" && Date.now() - t < AVISO_PLAY_DIAS * 86400000; };
const tocaAvisarDePlay = () => esAndroid() && !enAppInstalada() && !avisoPlaySilenciado();

// LOS DÍAS FUERTES DE MADRID
//
// eventos.json va en el mismo sitio que la app, así que no hay API, ni clave
// que se pueda robar del código, ni servidor que pagar, y sin cobertura sigue
// valiendo lo último que se bajó. Para cambiar el calendario basta con subir
// el archivo: como la app de Play carga esta web por dentro, le llega a todo
// el mundo sin pasar por Google.
const EVENTOS_KEY = "tc_eventos";
const EVENTOS_MAX = 400;
const EVENTOS_DIAS_MAX = 15;           // lo que dura una feria larga
const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const ES_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
// "salida" es la ventana en que sale la gente, que es cuando hay trabajo:
// "23:00-00:00", o solo "01:00" para decir "desde la una". "hora" es cuándo
// empieza, para cuando no se sabe más.
const leerSalida = (v) => {
  if (typeof v !== "string") return null;
  const [desde, hasta] = v.split(/\s*[-–]\s*/);
  if (!ES_HORA.test(desde || "")) return null;
  return { desde, hasta: ES_HORA.test(hasta || "") ? hasta : "" };
};
// Cada evento va en la noche en que pasa, así que lo de antes de las seis ya
// es madrugada del día siguiente y se ordena detrás de lo de las 23:00.
const minutosNoche = (h) => { const [hh, mm] = h.split(":").map(Number); return (hh < 6 ? hh + 24 : hh) * 60 + mm; };
const ordenDelDia = (e) => { const h = (e.salida && e.salida.desde) || e.hora; return h ? minutosNoche(h) : -1; };
const aLas = (h) => (h.startsWith("01:") ? "a la " : "a las ") + h;
const textoHoras = (e) => {
  const partes = [];
  if (e.salida) partes.push(e.salida.hasta ? `Salida ${e.salida.desde} – ${e.salida.hasta}` : `Salida desde ${aLas(e.salida.desde).slice(2)}`);
  if (e.hora) partes.push(`Empieza ${aLas(e.hora)}`);
  if (e.salida && minutosNoche(e.salida.desde) >= 24 * 60) partes.push("ya de madrugada");
  return partes.join(" · ");
};
// El archivo es nuestro, pero se lee como si no lo fuera: si algún día sale
// mal generado, la app tiene que seguir abriendo igual y sin días inventados.
const limpiarEventos = (crudo) => {
  if (!crudo || !Array.isArray(crudo.eventos)) return null;
  const out = [];
  for (const e of crudo.eventos) {
    if (!e || typeof e !== "object") continue;
    if (!ES_FECHA.test(e.fecha) || typeof e.titulo !== "string" || !e.titulo.trim()) continue;
    const hasta = ES_FECHA.test(e.hasta) && e.hasta >= e.fecha ? e.hasta : e.fecha;
    out.push({ fecha: e.fecha, hasta, titulo: String(e.titulo).slice(0, 60), lugar: e.lugar ? String(e.lugar).slice(0, 40) : "", nota: e.nota ? String(e.nota).slice(0, 160) : "", hora: ES_HORA.test(e.hora || "") ? e.hora : "", salida: leerSalida(e.salida) });
    if (out.length >= EVENTOS_MAX) break;
  }
  return { actualizado: ES_FECHA.test(crudo.actualizado) ? crudo.actualizado : "", eventos: out, lugares: limpiarLugares(crudo.lugares) };
};
// Dónde está cada recinto, para el mapa. Lo que no cae dentro de la Comunidad
// de Madrid (una errata, latitud y longitud al revés) se descarta sin más.
const limpiarLugares = (l) => {
  const out = {};
  if (!l || typeof l !== "object" || Array.isArray(l)) return out;
  for (const [n, c] of Object.entries(l)) {
    if (Array.isArray(c) && c.length === 2 && c.every(Number.isFinite) && c[0] > 39.85 && c[0] < 41.2 && c[1] > -4.6 && c[1] < -3.0) out[String(n).slice(0, 40)] = [c[0], c[1]];
    if (Object.keys(out).length >= 300) break;
  }
  return out;
};
// Un día puede tener varias cosas, y una feria ocupa varios días seguidos.
const indexarEventos = (lista) => {
  const mapa = {};
  for (const e of lista) {
    let f = e.fecha;
    for (let i = 0; i < EVENTOS_DIAS_MAX && f <= e.hasta; i++) {
      (mapa[f] = mapa[f] || []).push(e);
      f = shiftDays(f, 1);
    }
  }
  for (const f in mapa) mapa[f].sort((a, b) => ordenDelDia(a) - ordenDelDia(b));
  return mapa;
};

// LA JORNADA: a qué hora empieza y termina, cuántas carreras y las propinas.
// Las propinas son del conductor enteras: no entran en la facturación ni en el
// reparto con la empresa, así que calcDay no las ve y ningún balance cambia.
const minutosDe = (h) => { const [hh, mm] = h.split(":").map(Number); return hh * 60 + mm; };
// Si termina a una hora anterior a la de empezar es que pasó la medianoche: de
// 18:00 a 04:00 son 10 horas, que en el taxi es lo más normal del mundo.
const minutosJornada = (d) => {
  if (!d || !ES_HORA.test(d.inicio || "") || !ES_HORA.test(d.fin || "")) return 0;
  const m = minutosDe(d.fin) - minutosDe(d.inicio);
  return m > 0 ? m : m < 0 ? m + 1440 : 0;
};
const duracion = (min) => { const h = Math.floor(min / 60); const m = min % 60; return m ? `${h} h ${m} min` : `${h} h`; };
const propinasDe = (d) => Math.max(0, evalSuma(d && d.propinas));
const carrerasDe = (d) => Math.max(0, Math.round(evalSuma(d && d.carreras)));
// evento: el oro oscuro de la marca. Era morado y recordaba a Cabify; además
// el número blanco de los puntos del mapa se quedaba en 4,2:1 y así va a 5,1:1.
// No es el rojo del logo porque el rojo en la app es "debes a la empresa".
// El rojo de la banda del logo. Solo para el puntito de "hay evento" en la
// cuadrícula del calendario: a 5 px el dorado se perdía sobre las casillas que
// la facturación tiñe de ámbar. El resto de los eventos sigue en dorado.
const ROJO_TX = "#D8232A";
const C = { bg: "#f5f6fa", surf: "#ffffff", border: "#e3e6f0", acc: "#f0c040", accDim: "#8a6a17", green: "#189a5f", red: "#d63b3b", blue: "#2f6fe0", evento: "#8a6a17", t1: "#1a1d29", t2: "#5c6178", t3: "#8f93a8" };
const card = { background: C.surf, border: `1px solid ${C.border}`, borderRadius: 16, boxShadow: "0 2px 10px rgba(30,34,54,0.08)" };
const BANDA = "M0 77 L100 27 L100 55 L0 105 Z";
const Mono = ({ color }) => (
  <text x="50" y="62" textAnchor="middle" fill={color} fontFamily="'DM Sans', system-ui, sans-serif" fontSize="41" fontWeight="800" letterSpacing="-2">TX</text>
);
const TXLogo = ({ size = 52 }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" aria-label="TXpro" role="img" style={{ display: "block", flexShrink: 0, filter: "drop-shadow(0 2px 7px rgba(30,34,54,0.20))" }}>
    <defs>
      <clipPath id="txTile"><rect width="100" height="100" rx="23" /></clipPath>
      <clipPath id="txBand"><path d={BANDA} /></clipPath>
      <mask id="txMask"><rect width="100" height="100" fill="#fff" /><path d={BANDA} fill="#000" /></mask>
    </defs>
    <g clipPath="url(#txTile)">
      <rect width="100" height="100" fill="#FFFFFF" />
      <path d={BANDA} fill="#D8232A" />
      <g mask="url(#txMask)"><Mono color="#D8232A" /></g>
      <g clipPath="url(#txBand)"><Mono color="#FFFFFF" /></g>
      <rect x="0.7" y="0.7" width="98.6" height="98.6" rx="22.3" fill="none" stroke="rgba(21,23,31,0.15)" strokeWidth="1.4" />
    </g>
  </svg>
);

const TRAZOS = {
  diario: <><rect x="4.2" y="3.6" width="15.6" height="17" rx="2.6" /><path d="M9 3.2h6v2.6H9z" /><path d="M8.4 11h7.2M8.4 15h4.6" /></>,
  calendario: <><rect x="3.6" y="5.2" width="16.8" height="15.2" rx="2.6" /><path d="M3.6 10h16.8" /><path d="M8.2 3.4v3.4M15.8 3.4v3.4" /><path d="M7.6 13.6h2.2M12 13.6h2.2M7.6 17h2.2M12 17h2.2" /></>,
  gastos: <><path d="M4.4 20.4V5.2a2 2 0 0 1 2-2h4.8a2 2 0 0 1 2 2v15.2" /><path d="M3.2 20.4h11.2" /><path d="M6.9 8h3.8" /><path d="M13.2 9.4h2.6a1.8 1.8 0 0 1 1.8 1.8v4.4a1.6 1.6 0 0 0 3.2 0V9.2l-2.4-2.4" /></>,
  mensual: <><path d="M4 20.4h16" /><rect x="6.2" y="12.4" width="3.4" height="5.6" rx="1.1" /><rect x="11.3" y="8.4" width="3.4" height="9.6" rx="1.1" /><rect x="16.4" y="5" width="3.4" height="13" rx="1.1" /></>,
  objetivos: <><circle cx="12" cy="12" r="8.6" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" /></>,
  periodo: <><path d="M4 12h16" /><circle cx="7" cy="12" r="2.6" /><circle cx="17" cy="12" r="2.6" /><path d="M7 6.4v2.6M17 15v2.6" /></>,
  ajustes: <><circle cx="12" cy="12" r="3.1" /><path d="M18.9 14.6a1.5 1.5 0 0 0 .3 1.7l.1.1a1.9 1.9 0 1 1-2.7 2.7l-.1-.1a1.5 1.5 0 0 0-2.6 1.1v.3a1.9 1.9 0 1 1-3.8 0v-.2a1.5 1.5 0 0 0-2.6-1.2l-.1.1a1.9 1.9 0 1 1-2.7-2.7l.1-.1a1.5 1.5 0 0 0-1.1-2.6h-.3a1.9 1.9 0 1 1 0-3.8h.2a1.5 1.5 0 0 0 1.2-2.6l-.1-.1a1.9 1.9 0 1 1 2.7-2.7l.1.1a1.5 1.5 0 0 0 2.6-1.1v-.3a1.9 1.9 0 1 1 3.8 0v.2a1.5 1.5 0 0 0 2.6 1.2l.1-.1a1.9 1.9 0 1 1 2.7 2.7l-.1.1a1.5 1.5 0 0 0 1.1 2.6h.3a1.9 1.9 0 1 1 0 3.8h-.2a1.5 1.5 0 0 0-1.4.9z" /></>,
};
const Icono = ({ name, size = 23 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: "block" }}>{TRAZOS[name]}</svg>
);
const TaxiLogo = ({ size = 26, color = "#0d0f14" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={{ flexShrink: 0, display: "block" }}>
    <path d="M18.92 6c-.2-.58-.76-1-1.42-1h-11c-.66 0-1.21.42-1.42 1L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-6zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z" />
  </svg>
);

// LOS ANILLOS DE OBJETIVOS. Mes fuera, semana en medio, hoy dentro, siempre en
// el mismo sitio y con el mismo color aunque falte alguno, para que el color
// diga siempre lo mismo. Colores comprobados con el validador para daltonismo
// (oro, azul y rosa: el verde es de "la empresa te debe" y el violeta no se
// distingue del azul). La parte vacía es un tono claro del mismo color; lo que
// pasa del 100 % da una segunda vuelta más oscura.
const ANILLOS = {
  mes: { c: "#b8860b", osc: "#7a5907" },
  semana: { c: "#2f6fe0", osc: "#1c47a0" },
  dia: { c: "#d6457a", osc: "#9c2552" },
};
const Anillos = ({ datos, marcaMes, centro }) => {
  const [montado, setMontado] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setMontado(true)); return () => cancelAnimationFrame(id); }, []);
  const G = 17, cx = 120, cy = 120;
  const radios = { mes: 109, semana: 87, dia: 65 };
  const arco = (r, v, color, key) => {
    const L = 2 * Math.PI * r;
    return <circle key={key} cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={G} strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`}
      strokeDasharray={`${montado ? L * v : 0} ${L}`} style={{ transition: "stroke-dasharray 0.9s cubic-bezier(.2,.8,.2,1)" }} />;
  };
  let marca = null;
  if (marcaMes != null && datos.mes) { const t = marcaMes * 2 * Math.PI; marca = <circle cx={cx + radios.mes * Math.sin(t)} cy={cy - radios.mes * Math.cos(t)} r={6} fill={C.t1} stroke="#fff" strokeWidth={2.5} />; }
  return (
    <div style={{ position: "relative", width: "100%", maxWidth: 240, margin: "0 auto" }}>
      <svg viewBox="0 0 240 240" style={{ width: "100%", display: "block" }} aria-hidden="true">
        {["mes", "semana", "dia"].map((k) => {
          const r = radios[k]; const { c, osc } = ANILLOS[k]; const d = datos[k];
          return (
            <g key={k}>
              <circle cx={cx} cy={cy} r={r} fill="none" stroke={d ? `${c}26` : "#eef0f6"} strokeWidth={G} />
              {d && d.frac > 0 && arco(r, Math.min(d.frac, 1), c, "a")}
              {d && d.frac > 1 && arco(r, Math.min(d.frac - 1, 1), osc, "b")}
            </g>
          );
        })}
        {marca}
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", pointerEvents: "none" }}>{centro}</div>
    </div>
  );
};

// EL MAPA DE LOS EVENTOS. Dibujado aquí con los contornos del IGN que trae
// mapa-madrid.json: sin servidores de mapas de fuera, funciona sin cobertura y
// no le cuenta a nadie qué se mira. Sin calles: municipios, sus nombres y los
// puntos. Dos vistas: Madrid y alrededores, donde está casi todo, y la
// Comunidad entera. Los puntos son HTML encima del dibujo para que el número y
// el tamaño no cambien con el zoom.
const ZONA_MADRID = { lat: [40.30, 40.50], lon: [-3.84, -3.54] };
const MapaEventos = ({ mapa, puntos, vista, setVista, marcado, setMarcado }) => {
  const ref = useRef(null);
  const [ancho, setAncho] = useState(300);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const medir = () => setAncho(el.clientWidth || 300);
    medir();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(medir); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const { lat0, lon0, k, cos } = mapa.proy;
  const P = (lat, lon) => [(lon - lon0) * cos * k, (lat0 - lat) * k];
  const vb = vista === "zona"
    ? (() => { const [x1, y1] = P(ZONA_MADRID.lat[1], ZONA_MADRID.lon[0]); const [x2, y2] = P(ZONA_MADRID.lat[0], ZONA_MADRID.lon[1]); return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }; })()
    : { x: mapa.caja[0] - 10, y: mapa.caja[1] - 10, w: mapa.caja[2] + 20, h: mapa.caja[3] + 20 };
  const esc = ancho / vb.w;
  const aPx = ([x, y]) => [(x - vb.x) * esc, (y - vb.y) * esc];
  const dentro = ([x, y]) => x >= vb.x && x <= vb.x + vb.w && y >= vb.y && y <= vb.y + vb.h;
  const alto = vb.h * esc;
  const marcas = puntos.map((p, i) => ({ ...p, n: i + 1, s: aPx(P(p.lat, p.lon)), en: dentro(P(p.lat, p.lon)) })).filter((m) => m.en);
  // Toda la Comunidad: lo que cae junto se agrupa, y al tocarlo se va a Madrid.
  // Madrid y alrededores: lo que se pisa se aparta un poco, con una raya hasta
  // su sitio de verdad.
  const D = 24;
  let grupos = [];
  if (vista === "comunidad") {
    for (const m of marcas) { const g = grupos.find((g) => Math.hypot(g.s[0] - m.s[0], g.s[1] - m.s[1]) < D); if (g) g.miembros.push(m); else grupos.push({ s: [...m.s], miembros: [m] }); }
  } else {
    const pos = marcas.map((m) => [...m.s]);
    for (let it = 0; it < 40; it++) for (let i = 0; i < pos.length; i++) for (let j = i + 1; j < pos.length; j++) {
      let dx = pos[j][0] - pos[i][0], dy = pos[j][1] - pos[i][1]; let d = Math.hypot(dx, dy);
      if (d >= D) continue;
      if (d < 0.01) { dx = Math.cos(i + j); dy = Math.sin(i + j); d = 1; }
      const f = (D - d) / 2 / d; pos[i][0] -= dx * f; pos[i][1] -= dy * f; pos[j][0] += dx * f; pos[j][1] += dy * f;
    }
    grupos = marcas.map((m, i) => ({ s: [Math.min(ancho - 13, Math.max(13, pos[i][0])), Math.min(alto - 13, Math.max(13, pos[i][1]))], real: m.s, miembros: [m] }));
  }
  // Nombres de municipios por orden de importancia (el del archivo): cada uno se
  // queda solo si no pisa a un punto ni a un nombre ya puesto, y el que se sale
  // por el borde se mete hacia dentro en vez de cortarse.
  const ocupado = grupos.map((g) => ({ x: g.s[0] - 16, y: g.s[1] - 16, w: 32, h: 32 }));
  const choca = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const etiquetas = [];
  for (const n of mapa.nombres) {
    if (!(n.en === "ambas" || n.en === vista) || !dentro([n.x, n.y])) continue;
    const [sx, sy] = aPx([n.x, n.y]); const w = n.n.length * 5.9 + 6, h = 14;
    const x = Math.min(Math.max(sx, w / 2 + 3), ancho - w / 2 - 3), y = Math.min(Math.max(sy, h / 2 + 3), alto - h / 2 - 3);
    const caja = { x: x - w / 2, y: y - h / 2, w, h };
    if (ocupado.some((o) => choca(o, caja))) continue;
    ocupado.push(caja); etiquetas.push({ ...n, s: [x, y] });
  }
  return (
    <div ref={ref} style={{ position: "relative", width: "100%", height: alto, borderRadius: 12, overflow: "hidden", background: "#e8ebf2" }}>
      <svg viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} aria-hidden="true">
        <path d={mapa.tierra} fill="#ffffff" stroke="#b6bccb" strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
        <path d={mapa.capital} fill={`${C.acc}24`} />
        <path d={mapa.bordes} fill="none" stroke="#d6dae4" strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
      </svg>
      {grupos.filter((g) => g.real && Math.hypot(g.real[0] - g.s[0], g.real[1] - g.s[1]) > 3).map((g) => (
        <svg key={`r${g.miembros[0].n}`} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} aria-hidden="true">
          <line x1={g.real[0]} y1={g.real[1]} x2={g.s[0]} y2={g.s[1]} stroke={C.t2} strokeWidth={1} />
          <circle cx={g.real[0]} cy={g.real[1]} r={2.5} fill={C.t1} />
        </svg>
      ))}
      {etiquetas.map((n) => (
        <span key={n.n} style={{ position: "absolute", left: n.s[0], top: n.s[1], transform: "translate(-50%,-50%)", fontSize: 10, fontWeight: 700, color: C.t3, whiteSpace: "nowrap", textShadow: "0 0 3px #fff, 0 0 3px #fff, 0 0 3px #fff", pointerEvents: "none" }}>{n.n}</span>
      ))}
      {grupos.map((g) => {
        if (g.miembros.length > 1) return (
          <button key={`g${g.miembros[0].n}`} className="nb" onClick={() => setVista("zona")} aria-label={`${g.miembros.length} sitios juntos: ver Madrid de cerca`}
            style={{ position: "absolute", left: g.s[0], top: g.s[1], transform: "translate(-50%,-50%)", minWidth: 32, height: 32, padding: "0 6px", borderRadius: 16, border: "2px solid #fff", background: C.t1, color: "#fff", fontWeight: 900, fontSize: 12, fontFamily: "inherit", cursor: "pointer", boxShadow: "0 2px 6px rgba(30,34,54,0.3)" }}>{g.miembros.length}</button>
        );
        const m = g.miembros[0]; const on = marcado === m.lugar;
        return (
          <button key={`m${m.n}`} className="nb" onClick={() => setMarcado(on ? null : m.lugar)} aria-label={`${m.n}. ${m.lugar}`} aria-pressed={on}
            style={{ position: "absolute", left: g.s[0], top: g.s[1], transform: `translate(-50%,-50%) scale(${on ? 1.2 : 1})`, width: 26, height: 26, borderRadius: 13, border: `2px solid ${on ? C.t1 : "#fff"}`, background: C.evento, color: "#fff", fontWeight: 900, fontSize: 12, fontFamily: "inherit", cursor: "pointer", boxShadow: "0 2px 6px rgba(30,34,54,0.3)", transition: "transform .15s", padding: 0 }}>{m.n}</button>
        );
      })}
    </div>
  );
};

// DESGLOSE: cuánto de cada cosa en un mes o un periodo, que es lo que pregunta
// la empresa: "¿cuánto has hecho en efectivo? ¿y en Uber?". Mismas dos columnas
// que el Diario. El efectivo del taxímetro es el taxímetro menos lo cobrado con
// tarjeta; en las apps de tipo "cobrado" es lo que no cobró la empresa. Así la
// suma de la columna de efectivo es el mismo efectivo de la liquidación.
const desgloseDe = (entries, plats) => {
  const n = (v) => Number(v) || 0;
  let tax = 0, tarjeta = 0;
  const porPlat = plats.map((p) => ({ p, fact: 0, efec: 0 }));
  for (const [, d] of entries) {
    tax += n(d.taximetro); tarjeta += n(d.visa);
    for (const x of porPlat) { const t = n(d[x.p.key]), c = n(d[x.p.cobKey]); x.fact += t; x.efec += x.p.tipo === "cobrado" ? t - c : c; }
  }
  const filas = [{ nombre: "Taxímetro", fact: tax, efec: tax - tarjeta }, ...porPlat.filter((x) => x.fact || x.efec).map((x) => ({ nombre: x.p.nombre, fact: x.fact, efec: x.efec }))];
  return { filas, tarjeta, totalFact: filas.reduce((a, f) => a + f.fact, 0), totalEfec: filas.reduce((a, f) => a + f.efec, 0) };
};
const Desglose = ({ entries, plats, etiqueta }) => {
  const [aviso, setAviso] = useState("");
  const d = desgloseDe(entries, plats);
  const col = { width: 88, flexShrink: 0, textAlign: "right" };
  const limpio = (v) => fmt(v).replace(/ /g, " ");
  const texto = [`TXpro · ${etiqueta}`, ...d.filas.map((f) => `${f.nombre}: ${limpio(f.fact)} · efectivo ${limpio(f.efec)}`), ...(d.tarjeta ? [`Tarjeta: ${limpio(d.tarjeta)}`] : []), `TOTAL: ${limpio(d.totalFact)} · efectivo ${limpio(d.totalEfec)}`].join("\n");
  const copiar = async () => {
    let ok = false;
    try { await navigator.clipboard.writeText(texto); ok = true; } catch {
      try { const ta = document.createElement("textarea"); ta.value = texto; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); ok = document.execCommand("copy"); ta.remove(); } catch {}
    }
    setAviso(ok ? "Copiado: pégalo en WhatsApp" : "No se pudo copiar en este móvil"); setTimeout(() => setAviso(""), 2500);
  };
  return (
    <div style={{ ...card, padding: 16, marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
        <div style={{ flex: 1, fontSize: 11, color: C.t2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Desglose</div>
        <div style={{ ...col, fontSize: 10.5, color: C.t2, fontWeight: 700, letterSpacing: 0.5 }}>FACTURADO</div>
        <div style={{ ...col, fontSize: 10.5, color: C.blue, fontWeight: 700, letterSpacing: 0.5 }}>EFECTIVO</div>
      </div>
      {d.filas.map((f) => (
        <div key={f.nombre} style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 0", borderTop: "1px solid #eef0f6" }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: C.t1, wordBreak: "break-word" }}>{f.nombre}</span>
          <span style={{ ...col, fontSize: 13.5, fontWeight: 700, color: C.t1 }}>{fmt(f.fact)}</span>
          <span style={{ ...col, fontSize: 13.5, fontWeight: 700, color: C.t1 }}>{fmt(f.efec)}</span>
        </div>
      ))}
      {d.tarjeta > 0 && <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 0", borderTop: "1px solid #eef0f6" }}>
        <span style={{ flex: 1, fontSize: 13, color: C.t2 }}>Con tarjeta</span>
        <span style={{ ...col, fontSize: 13.5, fontWeight: 600, color: C.t2 }}>{fmt(d.tarjeta)}</span>
        <span style={col} />
      </div>}
      <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 0 2px", borderTop: `2px solid ${C.border}` }}>
        <span style={{ flex: 1, fontSize: 13.5, fontWeight: 900, color: C.t1 }}>Total</span>
        <span style={{ ...col, fontSize: 14.5, fontWeight: 900, color: C.accDim }}>{fmt(d.totalFact)}</span>
        <span style={{ ...col, fontSize: 14.5, fontWeight: 900, color: C.blue }}>{fmt(d.totalEfec)}</span>
      </div>
      <div style={{ fontSize: 11, color: C.t3, marginTop: 8, lineHeight: 1.45 }}>Efectivo del taxímetro: el taxímetro menos lo cobrado con tarjeta.</div>
      <button className="nb" onClick={copiar} style={{ marginTop: 10, width: "100%", padding: 10, borderRadius: 10, border: `1px solid ${C.acc}66`, background: `${C.acc}14`, color: C.accDim, fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>{aviso || "Copiar para la empresa"}</button>
    </div>
  );
};

const Hero = ({ total, conductor, pct }) => (
  <div style={{ background: `${C.acc}10`, border: `1px solid ${C.acc}30`, borderRadius: 18, padding: 18, marginBottom: 12, boxShadow: `0 4px 18px ${C.acc}14` }}>
    <div style={{ fontSize: 32, fontWeight: 900, color: C.accDim }}>{fmt(total)}</div>
    <div style={{ fontSize: 13, color: C.t2, marginTop: 6 }}>Facturación base · Conductor ({pct}%): <strong style={{ color: C.t1 }}>{fmt(conductor)}</strong></div>
  </div>
);
const StatCard = ({ title, items, children }) => (
  <div style={{ ...card, padding: 16, marginBottom: 12 }}>
    <div style={{ fontSize: 11, color: C.t2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>{title}</div>
    {items.map(({ label, val, color, bold, neg }, i, arr) => (
      <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : "none" }}>
        <span style={{ fontSize: 13, color: C.t2 }}>{label}</span><span style={{ fontWeight: bold ? 800 : 600, fontSize: bold ? 16 : 14, color }}>{neg ? "−" : ""}{fmt(val)}</span>
      </div>
    ))}
    {children}
  </div>
);
// Horas, carreras y propinas del mes o del periodo. Solo sale si hay algo
// apuntado: a quien no lleva la jornada no se le llena la pantalla de ceros.
const JornadaResumen = ({ j, pct }) => {
  if (!j || (!j.min && !j.carreras && !j.propinas)) return null;
  const filas = [];
  if (j.min) filas.push({ label: `Horas trabajadas (${j.diasConHoras} ${j.diasConHoras === 1 ? "día" : "días"})`, val: duracion(j.min) });
  if (j.carreras) filas.push({ label: "Carreras", val: String(j.carreras) });
  if (j.propinas) filas.push({ label: "Propinas (enteras para ti)", val: fmt(j.propinas), color: C.green });
  if (j.min) filas.push({ label: "Ganas por hora", val: `${fmt(j.ganadoConHoras / (j.min / 60))}/h`, color: C.accDim, bold: true });
  if (j.carreras) filas.push({ label: "Media por carrera", val: fmt(j.factConCarreras / j.carreras) });
  return (
    <div style={{ ...card, padding: 16, marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: C.t2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Tu jornada</div>
      {filas.map(({ label, val, color, bold }, i) => (
        <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: i < filas.length - 1 ? `1px solid ${C.border}` : "none" }}>
          <span style={{ fontSize: 13, color: C.t2 }}>{label}</span><span style={{ fontWeight: bold ? 800 : 600, fontSize: bold ? 16 : 14, color: color || C.t1 }}>{val}</span>
        </div>
      ))}
      {j.min > 0 && <div style={{ fontSize: 11, color: C.t3, marginTop: 8, lineHeight: 1.45 }}>Por hora: tu {pct}% más las propinas, entre las horas de los días en que apuntaste la jornada.</div>}
    </div>
  );
};
const Balance = ({ value, sub }) => { const neg = value <= 0; return (
  <div style={{ background: neg ? `${C.green}14` : `${C.red}14`, border: `1.5px solid ${neg ? C.green : C.red}44`, borderRadius: 16, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
    <div><div style={{ fontSize: 12, color: C.t2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}><><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: neg ? C.green : C.red, marginRight: 7, verticalAlign: "middle" }} />{neg ? "Empresa debe al conductor" : "Conductor debe a empresa"}</></div><div style={{ fontSize: 11, color: C.t3, marginTop: 3 }}>{sub}</div></div>
    <div style={{ fontSize: 24, fontWeight: 900, color: neg ? C.green : C.red, marginLeft: 14 }}>{neg ? "−" : "+"}{fmt(Math.abs(value))}</div>
  </div>
); };
const DayTable = ({ rows, pct }) => (
  <div style={{ ...card, padding: 16, marginBottom: 20, overflowX: "auto" }}>
    <div style={{ fontSize: 11, color: C.t2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Día a día</div>
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
      <thead><tr>{["Fecha", "Fact.", "Acum.", `${pct}% día`, "Diferencia"].map((h, i) => (<th key={h} style={{ padding: "6px 6px", color: C.t2, fontWeight: 700, textAlign: i === 0 ? "left" : "right", borderBottom: `1px solid ${C.border}`, fontSize: 11, whiteSpace: "nowrap" }}>{h}</th>))}</tr></thead>
      <tbody>{rows.map(({ date, s: ds, acumFact }) => { const neg = ds.diferencia <= 0; return (<tr key={date}><td style={{ padding: "8px 6px", color: C.t2, fontSize: 12, borderBottom: `1px solid ${C.border}22` }}>{dayMonth(date)}</td><td style={{ padding: "8px 6px", textAlign: "right", borderBottom: `1px solid ${C.border}22`, fontSize: 12 }}>{fmt(ds.facturacion)}</td><td style={{ padding: "8px 6px", textAlign: "right", borderBottom: `1px solid ${C.border}22`, fontSize: 12 }}>{fmt(acumFact)}</td><td style={{ padding: "8px 6px", textAlign: "right", borderBottom: `1px solid ${C.border}22`, color: C.accDim, fontWeight: 700, fontSize: 12 }}>{fmt(ds.conductor50)}</td><td style={{ padding: "8px 6px", textAlign: "right", borderBottom: `1px solid ${C.border}22`, color: neg ? C.green : C.red, fontWeight: 800, fontSize: 12, whiteSpace: "nowrap" }}>{neg ? "−" : "+"}{fmt(Math.abs(ds.diferencia))}</td></tr>); })}</tbody>
    </table>
    <div style={{ fontSize: 11, color: C.t3, marginTop: 10 }}>Verde (−) = empresa debe · Rojo (+) = conductor debe</div>
  </div>
);
function TXpro() {
  const [days, setDays] = useState(loadDays);
  const [view, setView] = useState("diario");
  const [editDate, setEditDate] = useState(today);
  // Lo que se escribe y no se ha guardado todavía, por fecha. Quien apunta viaje a
  // viaje no va a darle a "Guardar día" tras cada carrera: si se le cierra la app
  // o se reinicia el móvil, lo apuntado tiene que seguir ahí.
  const [borradores, setBorradores] = useState(() => { const b = loadStorage("tc_borradores", {}); return b && typeof b === "object" && !Array.isArray(b) ? Object.fromEntries(Object.entries(b).filter(([f, v]) => /^\d{4}-\d{2}-\d{2}$/.test(f) && v && typeof v === "object")) : {}; });
  const [form, setForm] = useState(() => { const b = loadStorage("tc_borradores", {}); if (b && b[today] && typeof b[today] === "object") return { ...b[today] }; const s = loadDays(); return s[today] ? { ...s[today] } : { ...EMPTY }; });
  const [enfoque, setEnfoque] = useState(null);
  const [saved, setSaved] = useState(false);
  const [notas, setNotas] = useState(() => { const n = loadStorage("tc_notas", {}); return n && typeof n === "object" ? n : {}; });
  const [calMes, setCalMes] = useState(monthKey(today));
  const [calDia, setCalDia] = useState(today);
  const [gastos, setGastos] = useState(loadGastos);
  const [gastoForm, setGastoForm] = useState({ date: today, concepto: "Combustible", importe: "", reembolsable: false });
  const [gastoSaved, setGastoSaved] = useState(false);
  const [cfg, setCfg] = useState(loadCfg);
  const [copia, setCopia] = useState(null);
  const [copiaMsg, setCopiaMsg] = useState("");
  const [hayUpdate, setHayUpdate] = useState(false);
  const [avisarPlay, setAvisarPlay] = useState(tocaAvisarDePlay);
  const [eventos, setEventos] = useState(() => limpiarEventos(loadStorage(EVENTOS_KEY, null)) || { actualizado: "", eventos: [], lugares: {} });
  // Lo guardado se pinta ya y la red lo refresca cada vez que se abre la app.
  // Antes se miraba solo cada 12 horas, y eso dejó a los que actualizaron a la
  // 1.9.0 con el calendario viejo, sin las coordenadas del mapa, hasta medio día
  // después. El archivo es pequeño y el navegador pregunta si ha cambiado antes
  // de bajarlo entero. Si no hay red, sigue valiendo el último que llegó.
  useEffect(() => {
    let vivo = true;
    fetch("./eventos.json", { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((crudo) => {
        const limpio = limpiarEventos(crudo);
        if (!limpio || !vivo) return;
        setEventos(limpio);
        // Se guarda tal cual llegó, no ya limpio: al abrir se vuelve a pasar por
        // limpiarEventos, y lo limpio no sobrevive a una segunda limpieza (las
        // horas dejan de ser texto y se perderían a partir del segundo día).
        try { localStorage.setItem(EVENTOS_KEY, JSON.stringify(crudo)); localStorage.removeItem(EVENTOS_KEY + "_visto"); } catch {}
      })
      .catch(() => {});
    return () => { vivo = false; };
  }, []);
  const eventosPorDia = useMemo(() => indexarEventos(eventos.eventos), [eventos]);
  const [mapa, setMapa] = useState(null);
  const [vistaMapa, setVistaMapa] = useState("zona");
  const [alcanceMapa, setAlcanceMapa] = useState(null);   // null: el día si tiene algo, si no el mes
  const [lugarMarcado, setLugarMarcado] = useState(null);
  useEffect(() => {
    if (view !== "calendario" || mapa) return;
    let vivo = true;
    fetch("./mapa-madrid.json").then((r) => (r.ok ? r.json() : null)).then((m) => { if (vivo && m && m.tierra && m.proy && Array.isArray(m.caja)) setMapa(m); }).catch(() => {});
    return () => { vivo = false; };
  }, [view, mapa]);
  const cerrarAvisoPlay = () => { setAvisarPlay(false); try { localStorage.setItem(AVISO_PLAY_KEY, JSON.stringify(Date.now())); } catch {} };
  useEffect(() => { const h = () => setHayUpdate(true); window.addEventListener("tc:update-ready", h); return () => window.removeEventListener("tc:update-ready", h); }, []);
  const [cfgOk, setCfgOk] = useState(() => loadStorage("tc_cfg_ok", false) === true);
  const marcarCfgOk = () => { setCfgOk(true); try { localStorage.setItem("tc_cfg_ok", "true"); } catch {} };
  const pct = num(cfg.pctConductor);
  const plats = cfg.plataformas;
  const platsActivas = plats.filter((p) => p.activa);
  const [appNueva, setAppNueva] = useState({ nombre: "", tipo: "efectivo" });
  const cambiarPlats = (fn) => { marcarCfgOk(); setCfg((c) => ({ ...c, plataformas: fn(c.plataformas) })); };
  const togglePlat = (key) => cambiarPlats((lista) => lista.map((pl) => (pl.key === key ? { ...pl, activa: !pl.activa } : pl)));
  const addPlat = () => { const nombre = appNueva.nombre.trim(); if (!nombre) return; cambiarPlats((lista) => [...lista, nuevaPlataforma(nombre, appNueva.tipo)]); setAppNueva({ nombre: "", tipo: "efectivo" }); };
  // Solo se puede borrar del todo una plataforma que no tenga nada apuntado: si
  // se fuera con días dentro, esas cifras seguirían en tc_days sin que nada las
  // sumara y los meses dejarían de cuadrar sin avisar. Con datos, se apaga.
  const platConDatos = (pl) => Object.values(days).some((d) => (Number(d[pl.key]) || 0) !== 0 || (Number(d[pl.cobKey]) || 0) !== 0);
  const quitarPlat = (key) => cambiarPlats((lista) => lista.filter((pl) => pl.key !== key));
  const [selectedMonth, setSelectedMonth] = useState(monthKey(today));
  const [rangeFrom, setRangeFrom] = useState(() => monthStart(today));
  const [rangeTo, setRangeTo] = useState(today);
  useEffect(() => { try { localStorage.setItem("tc_days", JSON.stringify(days)); } catch {} }, [days]);
  useEffect(() => { try { const limite = shiftDays(today, -60); localStorage.setItem("tc_borradores", JSON.stringify(Object.fromEntries(Object.entries(borradores).filter(([f]) => f >= limite)))); } catch {} }, [borradores]);
  useEffect(() => { try { localStorage.setItem("tc_gastos", JSON.stringify(gastos)); } catch {} }, [gastos]);
  useEffect(() => { try { localStorage.setItem("tc_notas", JSON.stringify(notas)); } catch {} }, [notas]);
  const ponerNota = (fecha, texto) => setNotas((prev) => { const next = { ...prev }; if (texto.trim()) next[fecha] = texto.slice(0, 120); else delete next[fecha]; return next; });
  useEffect(() => { try { localStorage.setItem("tc_cfg", JSON.stringify(cfg)); } catch {} }, [cfg]);
  const saveDay = () => { const parsed = {}; for (const k of clavesDia(plats)) parsed[k] = Math.max(0, evalSuma(form[k]));
    const prop = propinasDe(form); if (prop) parsed.propinas = prop;
    const car = carrerasDe(form); if (car) parsed.carreras = car;
    if (ES_HORA.test(form.inicio || "")) parsed.inicio = form.inicio;
    if (ES_HORA.test(form.fin || "")) parsed.fin = form.fin;
    const vacio = !hasData(parsed); setDays((prev) => { const next = { ...prev }; if (vacio) delete next[editDate]; else next[editDate] = parsed; return next; }); setForm(vacio ? { ...EMPTY } : { ...parsed }); quitarBorrador(editDate); setSaved(vacio ? "borrado" : "guardado"); setTimeout(() => setSaved(false), 2000); };
  const quitarBorrador = (f) => setBorradores((b) => { if (!b[f]) return b; const n = { ...b }; delete n[f]; return n; });
  const descartarBorrador = () => { if (!window.confirm("¿Descartar lo que has apuntado sin guardar en este día?")) return; quitarBorrador(editDate); setForm(days[editDate] ? { ...days[editDate] } : { ...EMPTY }); };
  // Todo lo que teclea el conductor pasa por aquí, para que quede en el borrador.
  const editar = (k, val) => { const n = { ...form, [k]: val }; setForm(n); setBorradores((b) => ({ ...b, [editDate]: n })); };
  // Al salir de la casilla se hace la cuenta y queda solo el total.
  const cerrarCasilla = (k) => { setEnfoque(null); const raw = form[k]; if (typeof raw !== "string" || !/[+\-,]/.test(raw)) return; const t = Math.max(0, evalSuma(raw)); editar(k, t > 0 ? String(t) : ""); };
  const sumarOtro = (k) => {
    const raw = String(form[k] ?? "").trim();
    if (raw && !/[+-]$/.test(raw)) editar(k, raw + "+");
    requestAnimationFrame(() => { const el = document.querySelector(`[data-casilla="${k}"]`); if (el) { el.focus(); const n = el.value.length; try { el.setSelectionRange(n, n); } catch {} } });
  };
  const changeDate = (d) => { setEditDate(d); setEnfoque(null); setForm(borradores[d] ? { ...borradores[d] } : days[d] ? { ...days[d] } : { ...EMPTY }); };
  const jornadaHoy = useMemo(() => ({ min: minutosJornada(form), propinas: propinasDe(form), carreras: carrerasDe(form), cruza: ES_HORA.test(form.inicio || "") && ES_HORA.test(form.fin || "") && form.fin < form.inicio }), [form]);
  const dayStats = useMemo(() => { const raw = {}; for (const k of clavesDia(plats)) raw[k] = Math.max(0, evalSuma(form[k])); return calcDay(raw, pct, plats); }, [form, pct, plats]);
  // Facturación de cada día contando lo guardado, lo apuntado sin guardar y lo que
  // se está escribiendo ahora mismo: los anillos se llenan viaje a viaje.
  const factVivo = useMemo(() => {
    const factDe = (d) => { const raw = {}; for (const k of clavesDia(plats)) raw[k] = Math.max(0, evalSuma(d && d[k])); return calcDay(raw, pct, plats).facturacion; };
    const mapa = {};
    for (const [f, d] of Object.entries(days)) mapa[f] = factDe(d);
    for (const [f, d] of Object.entries(borradores)) mapa[f] = factDe(d);
    mapa[editDate] = dayStats.facturacion;
    return mapa;
  }, [days, borradores, editDate, dayStats, pct, plats]);
  const ponerObjetivo = (k, v) => setCfg((c) => ({ ...c, objetivos: { ...(c.objetivos || {}), [k]: v } }));
  const saveGasto = () => { const importe = parseFloat(gastoForm.importe) || 0; if (!importe) return; setGastos((prev) => [...prev, { id: Date.now(), date: gastoForm.date, concepto: gastoForm.concepto.trim() || "Otros", importe, reembolsable: !!gastoForm.reembolsable }]); setGastoForm((f) => ({ ...f, importe: "" })); setGastoSaved(true); setTimeout(() => setGastoSaved(false), 2000); };
  const borrarGasto = (id) => setGastos((prev) => prev.filter((g) => g.id !== id));
  const months = useMemo(() => [...new Set(Object.keys(days).map(monthKey))].sort().reverse(), [days]);
  const monthData = useMemo(() => months.map((ym) => { const entries = Object.entries(days).filter(([d]) => monthKey(d) === ym).sort(([a], [b]) => a.localeCompare(b)); const g = sumarGastos(gastos, ym + "-01", finDeMes(ym)); const s = summarize(entries, pct, plats); return { ym, ...s, gastos: g, combustibleMes: g.combustible, diferenciaMes: s.diferenciaMes - g.reembolsable, incentivo: incentivoDe(cfg, s.totalFact, g.combustible) }; }), [months, days, gastos, pct, cfg, plats]);
  useEffect(() => { if (months.length && !months.includes(selectedMonth)) setSelectedMonth(months[0]); }, [months]);
  const selectedData = monthData.find((m) => m.ym === selectedMonth);
  const rangeData = useMemo(() => { const lo = rangeFrom <= rangeTo ? rangeFrom : rangeTo; const hi = rangeFrom <= rangeTo ? rangeTo : rangeFrom; const g = sumarGastos(gastos, lo, hi); const s = summarize(Object.entries(days).filter(([d]) => d >= lo && d <= hi).sort(([a], [b]) => a.localeCompare(b)), pct, plats); return { ...s, gastos: g, diferenciaMes: s.diferenciaMes - g.reembolsable }; }, [days, gastos, rangeFrom, rangeTo, pct, plats]);
  const maxFact = Math.max(1, ...monthData.map((m) => m.totalFact));
  const exportarCopia = async () => {
    const payload = { app: "txpro", formato: 3, exportado: new Date().toISOString(), appVersion: APP_VERSION, days, gastos, notas, cfg };
    const texto = JSON.stringify(payload, null, 2);
    const nombre = `txpro-${todayStr()}.json`;
    try {
      const file = new File([texto], nombre, { type: "application/json" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: nombre });
        setCopiaMsg("Copia enviada. Guárdala donde no se te pierda.");
        return;
      }
    } catch (e) { if (e && e.name === "AbortError") return; }
    try {
      const url = URL.createObjectURL(new Blob([texto], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url; a.download = nombre;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      setCopiaMsg(`Descargado ${nombre}`);
    } catch { setCopiaMsg("No se pudo crear la copia en este navegador."); }
  };
  const leerCopia = async (file) => {
    setCopiaMsg(""); setCopia(null);
    if (!file) return;
    try {
      const datos = JSON.parse(await file.text());
      if (!datos || !["txpro", "taxicuentas"].includes(datos.app) || typeof datos.days !== "object" || datos.days === null) {
        setCopiaMsg("Ese archivo no es una copia de TXpro.");
        return;
      }
      const fechas = Object.keys(datos.days).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
      setCopia({ datos, dias: fechas.length, gastos: Array.isArray(datos.gastos) ? datos.gastos.length : (Array.isArray(datos.fuel) ? datos.fuel.length : 0), desde: fechas[0], hasta: fechas[fechas.length - 1] });
    } catch { setCopiaMsg("No se pudo leer el archivo."); }
  };
  const restaurarCopia = () => {
    if (!copia) return;
    const { datos } = copia;
    const gastosCopia = Array.isArray(datos.gastos) ? datos.gastos.filter(gastoValido) : (Array.isArray(datos.fuel) ? datos.fuel.filter((e) => e && e.date && Number(e.importe) > 0).map((e, i) => ({ id: e.id || Date.now() + i, date: e.date, concepto: "Combustible", importe: Number(e.importe), reembolsable: false })) : []);
    const limpios = Object.fromEntries(Object.entries(datos.days).filter(([d, v]) => /^\d{4}-\d{2}-\d{2}$/.test(d) && v && typeof v === "object" && hasData(v)).map(([d, v]) => [d, migrateDay(v)]));
    setDays(limpios);
    setGastos(gastosCopia);
    setNotas(datos.notas && typeof datos.notas === "object" ? datos.notas : {});
    if (datos.cfg && typeof datos.cfg === "object") { setCfg({ ...DEFAULT_CFG, ...datos.cfg, plataformas: normPlataformas(datos.cfg.plataformas), objetivos: normObjetivos(datos.cfg.objetivos) }); marcarCfgOk(); }
    setBorradores({});
    setForm(limpios[editDate] ? { ...limpios[editDate] } : { ...EMPTY });
    setCopia(null);
    setCopiaMsg(`Restaurados ${Object.keys(limpios).length} días.`);
  };
  const ANCHO = 84;
  // Casilla de dinero con calculadora. Texto y no number: el campo numérico del
  // navegador no deja escribir "+" ni coma. Enter hace la cuenta, como el "=".
  const casilla = (k, etiqueta, estilo) => (
    <input className="inp" type="text" inputMode="decimal" enterKeyHint="done" autoComplete="off" placeholder="0.00" data-casilla={k} aria-label={etiqueta}
      style={{ ...inp, width: ANCHO, flexShrink: 0, padding: "9px 10px", fontSize: 14, textAlign: "right", ...estilo }}
      value={form[k] || ""} onFocus={() => setEnfoque(k)} onBlur={() => cerrarCasilla(k)}
      onChange={(e) => editar(k, limpiarCasilla(e.target.value))}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
  );
  // Debajo de la casilla que se está escribiendo: el botón de sumar otro viaje
  // (no todos los teclados numéricos tienen "+") y la cuenta en vivo. El
  // onMouseDown evita que el botón le quite el foco a la casilla y cierre el teclado.
  const ayudaSuma = (k) => {
    const raw = String(form[k] ?? "");
    const hayCuenta = /\d[+-]\d/.test(raw.replace(/,/g, "."));
    return (
      <div style={{ padding: "0 0 10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <button type="button" className="nb" onMouseDown={(e) => e.preventDefault()} onClick={() => sumarOtro(k)} style={{ padding: "7px 11px", borderRadius: 9, border: `1px solid ${C.acc}66`, background: `${C.acc}14`, color: C.accDim, fontWeight: 800, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>+ Sumar otro viaje</button>
        <span style={{ flex: 1, textAlign: "right", fontSize: 13, fontWeight: 800, color: C.accDim }}>{hayCuenta ? `= ${fmt(Math.max(0, evalSuma(raw)))}` : ""}</span>
        </div>
        {/* La casilla es estrecha y solo enseña el final de la cuenta: aquí van todos
            los viajes, para poder repasar si falta o sobra alguno. */}
        {hayCuenta && <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.5, wordBreak: "break-word" }}>{viajesDe(raw)}</div>}
      </div>
    );
  };
  // Una fila por concepto: el nombre a la izquierda y las casillas a la derecha,
  // todas alineadas en columna. Sin distintivos de las plataformas: el nombre en
  // texto dice de qué es la casilla y las marcas son de quien son.
  const filas = [
    { key: "taximetro", nombre: "Taxímetro", oro: true },
    ...platsActivas.map((pl) => ({ key: pl.key, cobKey: pl.cobKey, nombre: pl.nombre, cobrado: pl.tipo === "cobrado" })),
    { key: "visa", nombre: "Tarjeta" },
  ];
  const colHead = { fontSize: 9.5, fontWeight: 800, color: C.t3, letterSpacing: 0.4, textTransform: "uppercase", textAlign: "right", flexShrink: 0 };
  const inp = { width: "100%", background: "#f6f7fb", border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "11px 12px", color: C.t1, fontSize: 15, fontWeight: 700, fontFamily: "inherit" };
  return (
    <div style={{ maxWidth: 480, margin: "0 auto", minHeight: "100vh", background: C.bg, color: C.t1, fontFamily: "'DM Sans', sans-serif", paddingBottom: "calc(80px + env(safe-area-inset-bottom, 0px))" }}>
      <div style={{ background: `linear-gradient(180deg, ${C.surf}, #eef0f7)`, borderBottom: `2px solid ${C.acc}40`, padding: "18px 20px 14px", paddingTop: "calc(18px + env(safe-area-inset-top, 0px))", position: "sticky", top: 0, zIndex: 10, boxShadow: "0 2px 14px rgba(30,34,54,0.08)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <TXLogo size={52} />
          <div style={{ flex: 1 }}><div style={{ fontSize: 19, fontWeight: 900, letterSpacing: -0.5, color: C.t1 }}>TX<span style={{ color: C.accDim }}>pro</span></div><div style={{ fontSize: 11, color: C.t2 }}>Liquidaciones · Facturación · Comisiones</div></div>
          <button className="nb" onClick={() => setView(view === "ajustes" ? "diario" : "ajustes")} aria-label="Ajustes" style={{ background: view === "ajustes" ? `${C.acc}22` : C.surf, border: `1px solid ${view === "ajustes" ? C.acc : C.border}`, borderRadius: 12, width: 40, height: 40, cursor: "pointer", flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", color: view === "ajustes" ? C.accDim : C.t2 }}><Icono name="ajustes" size={20} /></button>
        </div>
      </div>
      {avisarPlay && <div style={{ margin: "16px 16px 0", background: `${C.blue}0f`, border: `1.5px solid ${C.blue}44`, borderRadius: 14, padding: 14 }}>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: C.t1, marginBottom: 4 }}>Estás usando la versión web</div>
        <div style={{ fontSize: 12.5, color: C.t2, lineHeight: 1.5, marginBottom: 10 }}>Instálate la app y la tendrás con su icono en el móvil, sin la barra del navegador encima y disponible aunque te quedes sin cobertura.</div>
        <div style={{ display: "flex", gap: 8 }}>
          <a className="saveBtn" href={PLAY_URL} target="_blank" rel="noopener noreferrer" style={{ flex: 1, padding: 10, borderRadius: 10, background: C.blue, color: "#fff", fontWeight: 800, fontSize: 13, fontFamily: "inherit", textAlign: "center", textDecoration: "none" }}>Instalar la app</a>
          <button className="nb" onClick={cerrarAvisoPlay} style={{ padding: "10px 14px", borderRadius: 10, border: `1px solid ${C.border}`, background: C.surf, color: C.t2, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Más tarde</button>
        </div>
      </div>}
      {hayUpdate && <div style={{ margin: "16px 16px 0", background: `${C.green}14`, border: `1.5px solid ${C.green}44`, borderRadius: 14, padding: 14, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1 }}><div style={{ fontSize: 13.5, fontWeight: 800, color: C.t1 }}>Hay una versión nueva</div><div style={{ fontSize: 11.5, color: C.t2, marginTop: 2 }}>Guarda lo que tengas a medias antes de actualizar.</div></div>
        <button className="saveBtn" onClick={() => window.tcApplyUpdate && window.tcApplyUpdate()} style={{ padding: "9px 14px", borderRadius: 10, border: "none", background: C.green, color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>Actualizar</button>
      </div>}
      <div style={{ padding: 16 }}>
        {view === "diario" && <>
          {!cfgOk && <div style={{ background: `${C.acc}12`, border: `1.5px solid ${C.acc}44`, borderRadius: 14, padding: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.t1, marginBottom: 4 }}>Ajusta la app a tu acuerdo</div>
            <div style={{ fontSize: 12.5, color: C.t2, lineHeight: 1.5, marginBottom: 10 }}>Pon el porcentaje que te paga tu empresa y, si te dan algún extra al llegar a cierta facturación, indícalo. Hasta que lo hagas, la app calcula con el 50% y sin extras.</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="saveBtn" onClick={() => setView("ajustes")} style={{ flex: 1, padding: 10, borderRadius: 10, border: "none", background: `linear-gradient(135deg,${C.acc},${C.accDim})`, color: "#0d0f14", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Configurar ahora</button>
              <button className="nb" onClick={marcarCfgOk} style={{ padding: "10px 14px", borderRadius: 10, border: `1px solid ${C.border}`, background: C.surf, color: C.t2, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Ahora no</button>
            </div>
          </div>}
          <input type="date" className="inp" style={{ ...inp, fontSize: 14, marginBottom: 14 }} value={editDate} onChange={(e) => changeDate(e.target.value)} />
          {saved && <div style={{ background: `${C.green}18`, border: `1px solid ${C.green}44`, borderRadius: 10, padding: 11, color: C.green, fontWeight: 700, textAlign: "center", marginBottom: 12, fontSize: 13 }}>{saved === "borrado" ? "Día eliminado" : "Día guardado"}</div>}
          <div style={{ ...card, padding: 16, marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: C.t2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Ingresos del día</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 7, paddingBottom: 7 }}>
              <div style={{ flex: 1, minWidth: 0 }} />
              <div style={{ ...colHead, width: ANCHO }}>Facturado</div>
              <div style={{ ...colHead, width: ANCHO, color: C.blue }}>Efectivo</div>
            </div>
            {filas.map((f) => (
              <React.Fragment key={f.key}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, borderTop: "1px solid #eef0f6", padding: "10px 0" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {f.oro && <TaxiLogo size={18} color={C.acc} />}
                    <span style={{ fontSize: 13.5, fontWeight: 800, color: f.oro ? "#c08a06" : C.t1, lineHeight: 1.2, wordBreak: "break-word" }}>{f.nombre}</span>
                  </div>
                  {f.cobrado && <div style={{ fontSize: 9.5, fontWeight: 700, color: C.green, marginTop: 3 }}>2ª casilla: ya cobrado</div>}
                </div>
                {casilla(f.key, f.nombre)}
                {f.cobKey
                  ? casilla(f.cobKey, `${f.nombre}, ${f.cobrado ? "ya cobrado" : "cobrado en efectivo"}`, { background: f.cobrado ? `${C.green}0d` : `${C.blue}0d`, borderColor: f.cobrado ? `${C.green}38` : `${C.blue}38` })
                  : <div style={{ width: ANCHO, flexShrink: 0 }} />}
              </div>
              {(enfoque === f.key || enfoque === f.cobKey) && ayudaSuma(enfoque)}
              </React.Fragment>
            ))}
            <div style={{ borderTop: "1px solid #eef0f6", paddingTop: 10, fontSize: 10.5, color: C.t3, lineHeight: 1.45 }}>
              ¿Trabajas con otras aplicaciones? Enciende las que uses o añade la tuya en <button className="nb" onClick={() => setView("ajustes")} style={{ background: "none", border: "none", padding: 0, font: "inherit", color: C.accDim, fontWeight: 800, cursor: "pointer", textDecoration: "underline" }}>Ajustes</button>.
            </div>
          </div>
          <div style={{ background: `linear-gradient(135deg, ${C.acc}18, ${C.acc}08)`, border: `2px solid ${C.acc}55`, borderRadius: 16, padding: "14px 18px", marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: `0 4px 16px ${C.acc}1a` }}>
            <div><div style={{ fontSize: 11, color: C.accDim, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Total facturación día</div><div style={{ fontSize: 11, color: C.t3, marginTop: 3 }}>Taxímetro + apps</div></div>
            <div style={{ fontSize: 28, fontWeight: 900, color: C.accDim }}>{fmt(dayStats.facturacion)}</div>
          </div>
          <div style={{ ...card, padding: 16, marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: C.t2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Cálculo del día</div>
            {[{ label: `${pct}% conductor (sobre fact. base)`, val: dayStats.conductor50, color: C.accDim, bold: true }, { label: "Cobrado por empresa (cobrado en apps + tarjeta)", val: dayStats.cobradoEmpresa, color: C.t2 }, { label: "Cobrado en efectivo por el conductor", val: dayStats.facturacion - dayStats.cobradoEmpresa, color: C.blue }].map(({ label, val, color, bold }, i, arr) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : "none" }}>
                <span style={{ fontSize: 13, color: C.t2 }}>{label}</span><span style={{ fontSize: bold ? 16 : 14, fontWeight: bold ? 800 : 600, color }}>{fmt(val)}</span>
              </div>
            ))}
          </div>
          {(() => { const neg = dayStats.diferencia <= 0; return (
            <div style={{ background: neg ? `${C.green}14` : `${C.red}14`, border: `1.5px solid ${neg ? C.green : C.red}44`, borderRadius: 16, padding: "16px", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div><div style={{ fontSize: 12, color: C.t2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}><><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: neg ? C.green : C.red, marginRight: 7, verticalAlign: "middle" }} />{neg ? "Empresa debe al conductor" : "Conductor debe a empresa"}</></div><div style={{ fontSize: 11, color: C.t3, marginTop: 4 }}>{neg ? "Empresa cobró más → paga diferencia" : "Conductor cobró más efectivo → descuenta"}</div></div>
              <div style={{ fontSize: 26, fontWeight: 900, color: neg ? C.green : C.red, marginLeft: 14, whiteSpace: "nowrap" }}>{neg ? "−" : "+"}{fmt(Math.abs(dayStats.diferencia))}</div>
            </div>
          ); })()}
          {(() => {
            const etiqueta = { fontSize: 12, color: C.t2, fontWeight: 600, marginBottom: 5, display: "block" };
            const campo = { ...inp, padding: "10px 11px", fontSize: 15 };
            const porHora = jornadaHoy.min ? (dayStats.conductor50 + jornadaHoy.propinas) / (jornadaHoy.min / 60) : 0;
            const datos = [
              jornadaHoy.min ? `${duracion(jornadaHoy.min)}${jornadaHoy.cruza ? " (pasas la medianoche)" : ""}` : null,
              porHora > 0 ? `ganas ${fmt(porHora)}/h` : null,
              jornadaHoy.carreras && dayStats.facturacion > 0 ? `${fmt(dayStats.facturacion / jornadaHoy.carreras)} por carrera` : null,
            ].filter(Boolean);
            return (
              <div style={{ ...card, padding: 16, marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: C.t2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Tu jornada</div>
                <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                  <label style={{ flex: 1, minWidth: 0 }}><span style={etiqueta}>Empiezas</span><input className="inp" type="time" aria-label="Hora de empezar" style={campo} value={form.inicio || ""} onChange={(e) => editar("inicio", e.target.value)} /></label>
                  <label style={{ flex: 1, minWidth: 0 }}><span style={etiqueta}>Terminas</span><input className="inp" type="time" aria-label="Hora de terminar" style={campo} value={form.fin || ""} onChange={(e) => editar("fin", e.target.value)} /></label>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <label style={{ flex: 1, minWidth: 0 }}><span style={etiqueta}>Carreras</span><input className="inp" type="number" min="0" step="1" inputMode="numeric" placeholder="0" aria-label="Número de carreras" style={{ ...campo, textAlign: "right" }} value={form.carreras || ""} onFocus={() => setEnfoque("carreras")} onBlur={() => setEnfoque(null)} onChange={(e) => editar("carreras", e.target.value.replace(/\D/g, ""))} /></label>
                  <label style={{ flex: 1, minWidth: 0 }}><span style={etiqueta}>Propinas</span>{casilla("propinas", "Propinas", { width: "100%", padding: "10px 11px", fontSize: 15 })}</label>
                </div>
                {enfoque === "propinas" && <div style={{ marginTop: 8 }}>{ayudaSuma("propinas")}</div>}
                {enfoque === "carreras" && <div style={{ marginTop: 8, paddingBottom: 2 }}><button type="button" className="nb" onMouseDown={(e) => e.preventDefault()} onClick={() => editar("carreras", String(carrerasDe(form) + 1))} style={{ padding: "7px 11px", borderRadius: 9, border: `1px solid ${C.acc}66`, background: `${C.acc}14`, color: C.accDim, fontWeight: 800, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>+1 carrera</button></div>}
                <div style={{ fontSize: 11, color: C.t3, marginTop: 9, lineHeight: 1.45 }}>Las propinas son tuyas enteras: no entran en la facturación ni en el reparto con la empresa.</div>
                {datos.length > 0 && <div style={{ marginTop: 10, background: `${C.acc}10`, border: `1px solid ${C.acc}33`, borderRadius: 10, padding: "9px 12px", fontSize: 13, fontWeight: 700, color: C.t1, lineHeight: 1.5 }}>{datos.join(" · ")}</div>}
              </div>
            );
          })()}
          {borradores[editDate] && <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8, fontSize: 12, color: C.t2 }}>
            <span><span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: C.acc, marginRight: 6, verticalAlign: "middle" }} />Apuntado pero sin guardar: se queda aunque cierres la app</span>
            <button className="nb" onClick={descartarBorrador} style={{ background: "none", border: "none", padding: 0, font: "inherit", fontSize: 12, color: C.red, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>Descartar</button>
          </div>}
          <button className="saveBtn" onClick={saveDay} style={{ width: "100%", padding: 14, borderRadius: 12, border: "none", background: `linear-gradient(135deg,${C.acc},${C.accDim})`, color: "#0d0f14", fontWeight: 900, fontSize: 15, cursor: "pointer", fontFamily: "inherit", boxShadow: `0 4px 16px ${C.acc}38` }}>Guardar día</button>
        </>}
        {view === "objetivos" && (() => {
          const obj = cfg.objetivos || {};
          const ws = weekStart(today); const we = shiftDays(ws, 6); const mk = monthKey(today);
          const suma = (ok) => Object.entries(factVivo).reduce((a, [f, v]) => (ok(f) ? a + v : a), 0);
          const hecho = { dia: factVivo[today] || 0, semana: suma((f) => f >= ws && f <= we), mes: suma((f) => monthKey(f) === mk) };
          const total = diasEnMes(mk); const diaMes = Number(today.slice(8));
          const quedanMes = total - diaMes + 1;            // contando hoy
          const quedanSemana = 7 - WD.indexOf(weekday(today));  // contando hoy; la semana empieza en lunes
          const nombres = { dia: "Hoy", semana: "Esta semana", mes: capitalizar(monthLabel(mk).split(" ")[0]) };
          const datos = {};
          for (const k of ["mes", "semana", "dia"]) { const meta = num(obj[k]); if (meta > 0) datos[k] = { meta, hecho: hecho[k], frac: hecho[k] / meta }; }
          const lider = datos.mes ? "mes" : datos.semana ? "semana" : datos.dia ? "dia" : null;
          const ritmo = datos.mes ? datos.mes.meta * (diaMes / total) : 0;
          const mesPasado = Object.entries(days).filter(([f]) => monthKey(f) === mesVecino(mk, -1)).reduce((a, [, d]) => a + calcDay(d, pct, plats).facturacion, 0);
          const umbralBono = cfg.incentivo === "bono" ? num(cfg.umbral) : 0;
          const lineaPie = (k) => {
            const d = datos[k]; const falta = d.meta - d.hecho;
            if (falta <= 0) return <span style={{ color: C.green, fontWeight: 800 }}>✓ Superado por {fmt(-falta)}</span>;
            if (k === "mes") return quedanMes === 1
              ? <>Te faltan <strong style={{ color: C.t1 }}>{fmt(falta)}</strong> y hoy es el último día del mes</>
              : <>Te faltan <strong style={{ color: C.t1 }}>{fmt(falta)}</strong>: {fmt(falta / quedanMes)} al día en los {quedanMes} días que quedan</>;
            if (k === "semana") return <>Te faltan <strong style={{ color: C.t1 }}>{fmt(falta)}</strong> en {quedanSemana} {quedanSemana === 1 ? "día" : "días"}</>;
            return <>Te faltan <strong style={{ color: C.t1 }}>{fmt(falta)}</strong> para hoy</>;
          };
          const etiqueta = { fontSize: 13, color: C.t1, fontWeight: 700 };
          return (<>
            <div style={{ ...card, padding: "18px 16px 14px", marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: C.t2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 14 }}>Tus objetivos</div>
              <Anillos datos={datos} marcaMes={datos.mes ? diaMes / total : null} centro={lider
                ? <><div style={{ fontSize: 46, fontWeight: 900, color: C.t1, lineHeight: 1, letterSpacing: -1.5 }}>{Math.round(datos[lider].frac * 100)}%</div><div style={{ fontSize: 12, color: C.t2, marginTop: 5, fontWeight: 600 }}>{lider === "mes" ? "del mes" : lider === "semana" ? "de la semana" : "de hoy"}</div></>
                : <div style={{ fontSize: 13, color: C.t2, lineHeight: 1.4, maxWidth: 120, fontWeight: 600 }}>Ponte un objetivo abajo y mira cómo se llena</div>} />
              {lider && <div style={{ marginTop: 16 }}>
                {["mes", "semana", "dia"].filter((k) => datos[k]).map((k, i, arr) => (
                  <div key={k} style={{ padding: "10px 0", borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : "none" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 10, height: 10, borderRadius: "50%", background: ANILLOS[k].c, flexShrink: 0 }} />
                      <span style={{ ...etiqueta, flex: 1 }}>{nombres[k]}</span>
                      <span style={{ fontSize: 15, fontWeight: 900, color: C.t1 }}>{Math.round(datos[k].frac * 100)}%</span>
                    </div>
                    <div style={{ fontSize: 13, color: C.t1, fontWeight: 600, marginTop: 3, paddingLeft: 18 }}>{fmt(datos[k].hecho)} <span style={{ color: C.t2, fontWeight: 500 }}>de {fmt0(datos[k].meta)}</span></div>
                    <div style={{ fontSize: 12, color: C.t2, marginTop: 4, paddingLeft: 18, lineHeight: 1.45 }}>{lineaPie(k)}</div>
                    {k === "mes" && datos.mes.hecho < datos.mes.meta && quedanMes > 1 && <div style={{ fontSize: 12, color: C.t2, marginTop: 3, paddingLeft: 18, lineHeight: 1.45 }}>
                      <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: C.t1, marginRight: 5, verticalAlign: "middle" }} />
                      El punto negro es donde deberías ir al acabar hoy: {datos.mes.hecho >= ritmo ? <>vas <strong style={{ color: C.t1 }}>{fmt(datos.mes.hecho - ritmo)} por delante</strong></> : <>vas <strong style={{ color: C.t1 }}>{fmt(ritmo - datos.mes.hecho)} por detrás</strong></>}.
                    </div>}
                  </div>
                ))}
              </div>}
            </div>

            <div style={{ ...card, padding: 16, marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: C.t2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Cuánto quieres facturar</div>
              <div style={{ fontSize: 11.5, color: C.t3, marginBottom: 12, lineHeight: 1.45 }}>Taxímetro más apps, como en Mensual. Deja vacío el que no quieras usar.</div>
              {[["dia", "Cada día"], ["semana", "Cada semana"], ["mes", "Cada mes"]].map(([k, lb]) => (
                <div key={k} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0" }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: ANILLOS[k].c, flexShrink: 0 }} />
                  <label htmlFor={`obj-${k}`} style={{ ...etiqueta, flex: 1 }}>{lb}</label>
                  <input id={`obj-${k}`} className="inp" type="number" min="0" step="1" inputMode="decimal" placeholder="—" aria-label={`Objetivo ${lb.toLowerCase()}`} style={{ ...inp, width: 110, textAlign: "right", padding: "9px 10px" }} value={obj[k] || ""} onChange={(e) => ponerObjetivo(k, e.target.value)} />
                  <span style={{ fontSize: 13, color: C.t2, fontWeight: 700 }}>€</span>
                </div>
              ))}
              {(mesPasado > 0 || (umbralBono > 0 && !num(obj.mes))) && <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 8, paddingTop: 10, fontSize: 12, color: C.t2, lineHeight: 1.5 }}>
                {mesPasado > 0 && <div>El mes pasado facturaste <strong style={{ color: C.t1 }}>{fmt(mesPasado)}</strong>.</div>}
                {umbralBono > 0 && !num(obj.mes) && <button className="nb" onClick={() => ponerObjetivo("mes", String(umbralBono))} style={{ marginTop: 8, padding: "8px 12px", borderRadius: 9, border: `1px solid ${C.acc}66`, background: `${C.acc}14`, color: C.accDim, fontWeight: 800, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>Usar el de tu bono ({fmt0(umbralBono)} al mes)</button>}
              </div>}
            </div>
          </>);
        })()}
        {view === "gastos" && (() => { const mesActual = monthKey(today); const ordenados = [...gastos].sort((a, b) => b.date.localeCompare(a.date)); const meses = [...new Set(ordenados.map((g) => monthKey(g.date)))]; return (<>
          <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 4 }}>Gastos</div>
          <div style={{ fontSize: 12, color: C.t2, marginBottom: 14 }}>Lo que pagas tú de tu bolsillo. Marca los que te devuelve la empresa y se descontarán de lo que le debes.</div>
          {gastoSaved && <div style={{ background: `${C.green}18`, border: `1px solid ${C.green}44`, borderRadius: 10, padding: 11, color: C.green, fontWeight: 700, textAlign: "center", marginBottom: 12, fontSize: 13 }}>Gasto guardado</div>}

          <div style={{ ...card, padding: 16, marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: C.t2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 14 }}>Nuevo gasto</div>
            <label htmlFor="gastoFecha" style={{ fontSize: 12, color: C.t2, fontWeight: 600, marginBottom: 5, display: "block" }}>Fecha</label>
            <input type="date" id="gastoFecha" aria-label="Fecha del gasto" className="inp" style={{ ...inp, fontSize: 14, marginBottom: 12 }} value={gastoForm.date} onChange={(e) => setGastoForm((f) => ({ ...f, date: e.target.value }))} />

            <label htmlFor="gastoConcepto" style={{ fontSize: 12, color: C.t2, fontWeight: 600, marginBottom: 5, display: "block" }}>Concepto</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
              {CONCEPTOS.map((c) => { const on = gastoForm.concepto === c; return (
                <button key={c} className="nb" onClick={() => setGastoForm((f) => ({ ...f, concepto: c, reembolsable: c !== "Combustible" }))} style={{ padding: "7px 11px", borderRadius: 999, border: `1.5px solid ${on ? C.acc : C.border}`, background: on ? `${C.acc}18` : C.surf, color: on ? C.accDim : C.t2, fontWeight: on ? 800 : 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>{c}</button>
              ); })}
            </div>
            <input id="gastoConcepto" aria-label="Concepto del gasto" className="inp" type="text" maxLength="40" placeholder="O escribe otro concepto" style={{ ...inp, fontSize: 14, marginBottom: 12 }} value={gastoForm.concepto} onChange={(e) => setGastoForm((f) => ({ ...f, concepto: e.target.value }))} />

            <label htmlFor="gastoImporte" style={{ fontSize: 12, color: C.t2, fontWeight: 600, marginBottom: 5, display: "block" }}>Importe (€)</label>
            <input id="gastoImporte" aria-label="Importe del gasto" className="inp" type="number" min="0" step="0.01" placeholder="0.00" style={{ ...inp, marginBottom: 12 }} value={gastoForm.importe} onChange={(e) => setGastoForm((f) => ({ ...f, importe: e.target.value }))} />

            <label htmlFor="gastoReemb" style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginBottom: 14, padding: "10px 12px", borderRadius: 10, background: gastoForm.reembolsable ? `${C.green}12` : "#f6f7fb", border: `1.5px solid ${gastoForm.reembolsable ? C.green + "55" : C.border}` }}>
              <input id="gastoReemb" type="checkbox" checked={!!gastoForm.reembolsable} onChange={(e) => setGastoForm((f) => ({ ...f, reembolsable: e.target.checked }))} style={{ width: 19, height: 19, accentColor: C.green, flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: gastoForm.reembolsable ? C.green : C.t2 }}>Me lo devuelve la empresa</span>
            </label>

            <button className="saveBtn" onClick={saveGasto} style={{ width: "100%", padding: 13, borderRadius: 12, border: "none", background: `linear-gradient(135deg,${C.acc},${C.accDim})`, color: "#0d0f14", fontWeight: 900, fontSize: 15, cursor: "pointer", fontFamily: "inherit", boxShadow: `0 4px 16px ${C.acc}38` }}>Guardar gasto</button>
          </div>

          {meses.length === 0 ? <div style={{ color: C.t2, textAlign: "center", padding: 32, fontSize: 14 }}>Todavía no has apuntado ningún gasto.</div> : meses.map((m) => {
            const delMes = ordenados.filter((g) => monthKey(g.date) === m);
            const sum = sumarGastos(gastos, m + "-01", finDeMes(m));
            return (
              <div key={m} style={{ ...card, padding: 16, marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12, gap: 8 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: C.t1 }}>{capitalizar(monthLabel(m))}{m === mesActual ? <span style={{ fontSize: 11, color: C.accDim, fontWeight: 700 }}> · en curso</span> : null}</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: C.red, whiteSpace: "nowrap" }}>−{fmt(sum.total)}</div>
                </div>
                {sum.reembolsable > 0 && <div style={{ background: `${C.green}12`, border: `1px solid ${C.green}33`, borderRadius: 10, padding: "8px 12px", marginBottom: 12, fontSize: 12.5, color: C.green, fontWeight: 700 }}>La empresa te debe {fmt(sum.reembolsable)} de estos gastos</div>}
                {delMes.map((g) => (
                  <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: `1px solid ${C.border}44` }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: C.t1 }}>{g.concepto}</div>
                      <div style={{ fontSize: 11, color: C.t3 }}>{dayMonth(g.date)}{g.reembolsable ? " · te lo devuelven" : ""}</div>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: g.reembolsable ? C.green : C.t1, whiteSpace: "nowrap" }}>{fmt(g.importe)}</div>
                    <button className="nb" onClick={() => borrarGasto(g.id)} aria-label={`Borrar ${g.concepto} de ${dayMonth(g.date)}`} style={{ background: `${C.red}14`, border: `1px solid ${C.red}33`, borderRadius: 8, padding: "5px 9px", color: C.red, fontSize: 12, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>✕</button>
                  </div>
                ))}
              </div>
            );
          })}
        </>); })()}
        {view === "calendario" && (() => {
          const huecos = primerDiaSemana(calMes);
          const total = diasEnMes(calMes);
          const celdas = [...Array(huecos).fill(null), ...Array.from({ length: total }, (_, i) => `${calMes}-${String(i + 1).padStart(2, "0")}`)];
          const delMes = celdas.filter(Boolean);
          const trabajados = delMes.filter((f) => days[f]).length;
          const facturado = delMes.reduce((a, f) => a + (days[f] ? calcDay(days[f], pct, plats).facturacion : 0), 0);
          const tope = Math.max(1, ...delMes.map((f) => (days[f] ? calcDay(days[f], pct, plats).facturacion : 0)));
          const sel = calDia && monthKey(calDia) === calMes ? calDia : null;
          const datosSel = sel && days[sel] ? calcDay(days[sel], pct, plats) : null;
          const flecha = { background: C.surf, border: `1px solid ${C.border}`, borderRadius: 10, width: 36, height: 36, fontSize: 18, color: C.t2, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 };
          return (<>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12 }}>
              <button className="nb" onClick={() => setCalMes(mesVecino(calMes, -1))} aria-label="Mes anterior" style={flecha}>‹</button>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 15, fontWeight: 900, color: C.t1 }}>{capitalizar(monthLabel(calMes))}</div>
                <div style={{ fontSize: 11.5, color: C.t2 }}>{trabajados} {trabajados === 1 ? "día trabajado" : "días trabajados"} · {fmt(facturado)}</div>
              </div>
              <button className="nb" onClick={() => setCalMes(mesVecino(calMes, 1))} aria-label="Mes siguiente" style={flecha}>›</button>
            </div>

            <div style={{ ...card, padding: 12, marginBottom: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 6 }}>
                {WD.map((d) => (<div key={d} style={{ textAlign: "center", fontSize: 10, fontWeight: 700, color: C.t3, textTransform: "uppercase", letterSpacing: 0.3 }}>{d}</div>))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
                {celdas.map((f, i) => {
                  if (!f) return <div key={`h${i}`} />;
                  const d = days[f];
                  const fact = d ? calcDay(d, pct, plats).facturacion : 0;
                  const esHoy = f === today;
                  const elegido = f === sel;
                  const intensidad = fact > 0 ? 0.18 + 0.55 * (fact / tope) : 0;
                  return (
                    <button key={f} className="nb" onClick={() => { setCalDia(f); setAlcanceMapa(null); setLugarMarcado(null); }} aria-label={`${f}${fact > 0 ? `, ${fmt(fact)}` : ", sin datos"}${eventosPorDia[f] ? `, ${eventosPorDia[f].map((e) => e.titulo).join(", ")}` : ""}`} style={{
                      aspectRatio: "1 / 1", borderRadius: 9, cursor: "pointer", fontFamily: "inherit", padding: 2,
                      border: elegido ? `2px solid ${C.accDim}` : esHoy ? `1.5px solid ${C.acc}` : `1px solid ${C.border}`,
                      background: fact > 0 ? `rgba(240,192,64,${intensidad})` : C.surf,
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1, position: "relative",
                    }}>
                      <span style={{ fontSize: 12.5, fontWeight: esHoy || elegido ? 900 : 600, color: fact > 0 ? C.t1 : C.t3 }}>{Number(f.slice(8))}</span>
                      {fact > 0 && <span style={{ fontSize: 8.5, fontWeight: 700, color: C.accDim, lineHeight: 1 }}>{Math.round(fact)}</span>}
                      {notas[f] && <span style={{ position: "absolute", top: 3, right: 3, width: 5, height: 5, borderRadius: "50%", background: C.blue }} />}
                      {eventosPorDia[f] && <span style={{ position: "absolute", top: 3, left: 3, width: 5, height: 5, borderRadius: "50%", background: ROJO_TX }} />}
                    </button>
                  );
                })}
              </div>
            </div>

            {sel && (
              <div style={{ ...card, padding: 16, marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: C.t1, textTransform: "capitalize" }}>{weekday(sel)} {Number(sel.slice(8))}</div>
                  {datosSel ? <div style={{ fontSize: 17, fontWeight: 900, color: C.accDim }}>{fmt(datosSel.facturacion)}</div>
                    : <div style={{ fontSize: 12.5, color: C.t3 }}>Sin datos</div>}
                </div>
                {datosSel && <div style={{ fontSize: 12.5, color: C.t2, marginBottom: 12 }}>{pct}% para ti: <strong style={{ color: C.t1 }}>{fmt(datosSel.conductor50)}</strong> · efectivo: <strong style={{ color: C.blue }}>{fmt(datosSel.facturacion - datosSel.cobradoEmpresa)}</strong></div>}
                {(eventosPorDia[sel] || []).map((e, i) => (
                  <div key={i} style={{ background: `${C.evento}12`, border: `1px solid ${C.evento}33`, borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: C.t1 }}>{e.titulo}</div>
                    {e.lugar && <div style={{ fontSize: 11.5, color: C.evento, fontWeight: 700, marginTop: 2 }}>{e.lugar}</div>}
                    {(e.salida || e.hora) && <div style={{ fontSize: 12.5, color: C.t1, fontWeight: 800, marginTop: 4 }}>{textoHoras(e)}</div>}
                    {e.nota && <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.45, marginTop: 4 }}>{e.nota}</div>}
                  </div>
                ))}
                <label htmlFor="calNota" style={{ fontSize: 12, color: C.t2, fontWeight: 600, marginBottom: 5, display: "block" }}>Nota del día</label>
                <input id="calNota" aria-label="Nota del día" className="inp" type="text" maxLength="120" placeholder="Concierto, feria, día libre…" style={{ ...inp, fontSize: 14, fontWeight: 500, marginBottom: 12 }} value={notas[sel] || ""} onChange={(e) => ponerNota(sel, e.target.value)} />
                <button className="saveBtn" onClick={() => { changeDate(sel); setView("diario"); }} style={{ width: "100%", padding: 11, borderRadius: 10, border: `1px solid ${C.border}`, background: C.surf, color: C.t2, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>{datosSel ? "Editar este día" : "Apuntar este día"}</button>
              </div>
            )}

            {mapa && (() => {
              const lugares = eventos.lugares || {};
              const delMes = eventos.eventos.filter((e) => monthKey(e.fecha) === calMes || monthKey(e.hasta) === calMes);
              const delDia = sel ? (eventosPorDia[sel] || []) : [];
              const conPunto = (lista) => lista.filter((e) => lugares[e.lugar]);
              const alcance = alcanceMapa === "mes" || !sel ? "mes" : alcanceMapa === "dia" ? "dia" : conPunto(delDia).length ? "dia" : "mes";
              const lista = alcance === "dia" ? delDia : delMes;
              // Un punto por recinto, en el orden en que pasan las cosas.
              const porLugar = new Map();
              for (const e of [...conPunto(lista)].sort((a, b) => a.fecha.localeCompare(b.fecha) || ordenDelDia(a) - ordenDelDia(b))) {
                if (!porLugar.has(e.lugar)) porLugar.set(e.lugar, { lugar: e.lugar, lat: lugares[e.lugar][0], lon: lugares[e.lugar][1], eventos: [] });
                porLugar.get(e.lugar).eventos.push(e);
              }
              const puntos = [...porLugar.values()];
              const generales = lista.filter((e) => !lugares[e.lugar]);
              const enZona = (p) => p.lat >= ZONA_MADRID.lat[0] && p.lat <= ZONA_MADRID.lat[1] && p.lon >= ZONA_MADRID.lon[0] && p.lon <= ZONA_MADRID.lon[1];
              const fuera = vistaMapa === "zona" ? puntos.filter((p) => !enZona(p)) : [];
              const chip = (on) => ({ padding: "6px 10px", borderRadius: 8, border: `1px solid ${on ? C.evento : C.border}`, background: on ? `${C.evento}14` : C.surf, color: on ? C.t1 : C.t2, fontWeight: on ? 800 : 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit" });
              const visibles = lugarMarcado && porLugar.has(lugarMarcado) ? [porLugar.get(lugarMarcado)] : puntos;
              return (
                <div style={{ ...card, padding: 16, marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 11, color: C.t2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Dónde es</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="nb" disabled={!sel} onClick={() => { setAlcanceMapa("dia"); setLugarMarcado(null); }} style={{ ...chip(alcance === "dia"), opacity: sel ? 1 : 0.5 }}>{sel ? `${capitalizar(weekday(sel))} ${Number(sel.slice(8))}` : "Este día"}</button>
                      <button className="nb" onClick={() => { setAlcanceMapa("mes"); setLugarMarcado(null); }} style={chip(alcance === "mes")}>Todo el mes</button>
                    </div>
                  </div>
                  <MapaEventos mapa={mapa} puntos={puntos} vista={vistaMapa} setVista={setVistaMapa} marcado={lugarMarcado} setMarcado={setLugarMarcado} />
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="nb" onClick={() => setVistaMapa("zona")} style={chip(vistaMapa === "zona")}>Madrid</button>
                      <button className="nb" onClick={() => setVistaMapa("comunidad")} style={chip(vistaMapa === "comunidad")}>Toda la Comunidad</button>
                    </div>
                    <span style={{ fontSize: 10, color: C.t3 }}>{mapa.fuente}</span>
                  </div>
                  {fuera.length > 0 && <button className="nb" onClick={() => setVistaMapa("comunidad")} style={{ marginTop: 8, background: "none", border: "none", padding: 0, font: "inherit", fontSize: 12, color: C.t2, cursor: "pointer", textAlign: "left" }}>Fuera de este mapa: <strong style={{ color: C.t1 }}>{fuera.map((p) => p.lugar).join(", ")}</strong> · <span style={{ textDecoration: "underline", fontWeight: 700, color: C.t1 }}>ver toda la Comunidad</span></button>}
                  {puntos.length === 0 && <div style={{ fontSize: 12.5, color: C.t2, marginTop: 10 }}>{alcance === "dia" ? "Este día no hay nada con sitio concreto." : "Este mes no hay nada con sitio concreto."}</div>}
                  {visibles.map((p) => { const n = puntos.indexOf(p) + 1; return (
                    <div key={p.lugar} onClick={() => setLugarMarcado(lugarMarcado === p.lugar ? null : p.lugar)} style={{ display: "flex", gap: 10, padding: "10px 0 2px", borderTop: `1px solid ${C.border}66`, marginTop: 8, cursor: "pointer" }}>
                      <span style={{ width: 22, height: 22, borderRadius: 11, background: C.evento, color: "#fff", fontWeight: 900, fontSize: 11, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{n}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: C.t1 }}>{p.lugar}</div>
                        {alcance === "dia"
                          ? p.eventos.map((e, i) => <div key={i} style={{ fontSize: 12, color: C.t2, marginTop: 2 }}>{e.titulo}{(e.salida || e.hora) ? ` · ${textoHoras(e)}` : ""}</div>)
                          : <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 5 }}>{p.eventos.map((e, i) => (
                              <button key={i} className="nb" onClick={(ev) => { ev.stopPropagation(); setCalDia(e.fecha); setAlcanceMapa("dia"); setLugarMarcado(null); }} title={e.titulo} style={{ padding: "3px 7px", borderRadius: 6, border: `1px solid ${C.border}`, background: "#f6f7fb", fontSize: 11.5, fontWeight: 700, color: C.t1, cursor: "pointer", fontFamily: "inherit" }}>{capitalizar(weekday(e.fecha))} {Number(e.fecha.slice(8))}</button>
                            ))}</div>}
                      </div>
                    </div>
                  ); })}
                  {lugarMarcado && porLugar.has(lugarMarcado) && puntos.length > 1 && <button className="nb" onClick={() => setLugarMarcado(null)} style={{ marginTop: 8, background: "none", border: "none", padding: 0, font: "inherit", fontSize: 12, color: C.t2, textDecoration: "underline", cursor: "pointer" }}>Ver todos los sitios</button>}
                  {alcance === "dia" && generales.length > 0 && <div style={{ fontSize: 12, color: C.t2, marginTop: 10 }}>En toda Madrid: <strong style={{ color: C.t1 }}>{generales.map((e) => e.titulo).join(", ")}</strong></div>}
                </div>
              );
            })()}
            {(() => {
              const delMesEv = eventos.eventos.filter((e) => monthKey(e.fecha) === calMes || monthKey(e.hasta) === calMes).sort((a, b) => a.fecha.localeCompare(b.fecha) || ordenDelDia(a) - ordenDelDia(b));
              if (!delMesEv.length) return null;
              return (
                <div style={{ ...card, padding: 16, marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: C.t2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Días fuertes del mes</div>
                  {delMesEv.map((e, i) => (
                    <div key={i} onClick={() => { setCalDia(e.fecha); if (monthKey(e.fecha) !== calMes) setCalMes(monthKey(e.fecha)); }} style={{ display: "flex", gap: 10, padding: "9px 0", borderBottom: i === delMesEv.length - 1 ? "none" : `1px solid ${C.border}44`, cursor: "pointer" }}>
                      <div style={{ fontSize: 12.5, fontWeight: 800, color: C.evento, minWidth: 38, flexShrink: 0 }}>{dayMonth(e.fecha)}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: C.t1, fontWeight: 700 }}>{e.titulo}</div>
                        {(e.lugar || e.salida || e.hora) && <div style={{ fontSize: 11.5, color: C.t3, marginTop: 1 }}>{[e.lugar, e.salida ? `salida ${e.salida.desde}` : e.hora ? `a las ${e.hora}` : ""].filter(Boolean).join(" · ")}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
            {(() => { const conNota = Object.keys(notas).filter((f) => monthKey(f) === calMes).sort(); if (!conNota.length) return null; return (
              <div style={{ ...card, padding: 16, marginBottom: 20 }}>
                <div style={{ fontSize: 11, color: C.t2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Notas del mes</div>
                {conNota.map((f) => (
                  <div key={f} onClick={() => setCalDia(f)} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: `1px solid ${C.border}44`, cursor: "pointer" }}>
                    <div style={{ fontSize: 12.5, fontWeight: 800, color: C.accDim, minWidth: 38 }}>{dayMonth(f)}</div>
                    <div style={{ fontSize: 13, color: C.t1, flex: 1 }}>{notas[f]}</div>
                  </div>
                ))}
              </div>
            ); })()}
          </>);
        })()}
        {view === "mensual" && <>
          {monthData.length === 0 && <div style={{ color: C.t2, textAlign: "center", padding: 40, fontSize: 14 }}>Sin datos. Registra días primero.</div>}
          {monthData.length > 0 && <>
            <div style={{ ...card, padding: 16, marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: C.t2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 14 }}>Facturación mensual</div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 132, overflowX: "auto", paddingBottom: 4 }}>
                {[...monthData].reverse().map((m) => (
                  <div key={m.ym} onClick={() => setSelectedMonth(m.ym)} style={{ cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, minWidth: 38, flexShrink: 0 }}>
                    <div style={{ fontSize: 9, color: C.t3, fontWeight: 700, whiteSpace: "nowrap" }}>{Math.round(m.totalFact)}€</div>
                    <div style={{ width: 22, height: Math.max(4, (m.totalFact / maxFact) * 84), borderRadius: 5, background: m.ym === selectedMonth ? `linear-gradient(180deg,${C.acc},${C.accDim})` : C.border, transition: "background 0.15s" }} />
                    <div style={{ fontSize: 10, color: m.ym === selectedMonth ? C.accDim : C.t3, fontWeight: m.ym === selectedMonth ? 800 : 500, textTransform: "capitalize" }}>{monthShort(m.ym)}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 900, color: C.t1 }}>{capitalizar(monthLabel(selectedMonth))}</div>
              <select className="inp" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} style={{ ...inp, width: "auto", padding: "8px 10px", fontSize: 13 }}>
                {months.map((m) => (<option key={m} value={m}>{monthLabel(m)}</option>))}
              </select>
            </div>
            {selectedData && (() => { const { rows, totalFact, conductorMes, totalCobradoEmpresa, diferenciaMes, efectivoMes, incentivo, combustibleMes, diasTrabajados, mediaDiaria, gastos: gastosMes } = selectedData; return (
              <div>
                <Hero total={totalFact} conductor={conductorMes} pct={pct} />
                <Desglose entries={Object.entries(days).filter(([d]) => monthKey(d) === selectedMonth)} plats={plats} etiqueta={capitalizar(monthLabel(selectedMonth))} />
                <StatCard title="Liquidación mensual" items={[{ label: `Media diaria (${diasTrabajados} ${diasTrabajados === 1 ? "día" : "días"})`, val: mediaDiaria, color: C.t1 }, { label: `${pct}% conductor s/ facturación base`, val: conductorMes, color: C.accDim, bold: true }, { label: "Cobrado por empresa (acumulado mes)", val: totalCobradoEmpresa, color: C.t1 }, { label: "Efectivo cobrado por el conductor", val: efectivoMes, color: C.blue }, ...(gastosMes.total > 0 ? [{ label: "Gastos del mes", val: gastosMes.total, color: C.red, neg: true }] : []), ...(cfg.incentivo === "combustible" && combustibleMes > 0 ? [{ label: "de ellos, combustible", val: combustibleMes, color: C.t2, neg: true }] : []), ...(gastosMes.reembolsable > 0 ? [{ label: "Gastos que te devuelve la empresa", val: gastosMes.reembolsable, color: C.green }] : []), ...(incentivo.importe > 0 ? [{ label: incentivo.etiqueta, val: incentivo.importe, color: C.green }] : [])]}>
                  {incentivo.tipo === "ninguno" ? null : incentivo.tipo === "incompleto" ? <div style={{ background: `${C.acc}08`, border: `1px solid ${C.acc}22`, borderRadius: 10, padding: "8px 12px", marginTop: 10, fontSize: 12, color: C.t2 }}>Te falta indicar tu incentivo en Ajustes</div> : incentivo.llega ? <div style={{ background: `${C.green}12`, border: `1px solid ${C.green}33`, borderRadius: 10, padding: "8px 12px", marginTop: 10, fontSize: 12, color: C.green, fontWeight: 700 }}>{incentivo.logrado}</div>
                  : <div style={{ background: `${C.acc}08`, border: `1px solid ${C.acc}22`, borderRadius: 10, padding: "8px 12px", marginTop: 10, fontSize: 12, color: C.t2 }}>{incentivo.pendiente}</div>}
                </StatCard>
                <JornadaResumen j={selectedData.jornada} pct={pct} />
                <Balance value={diferenciaMes} sub={gastosMes.reembolsable > 0 ? "Balance del mes · incluye los gastos a devolver" : "Balance mensual acumulado"} />
                <DayTable rows={rows} pct={pct} />
              </div>
            ); })()}
          </>}
        </>}
        {view === "ajustes" && (() => { const set = (k, v) => { marcarCfgOk(); setCfg((c) => ({ ...c, [k]: v })); }; const tipos = [["bono", "Bono en €"], ["combustible", "% combustible"], ["ninguno", "Ninguno"]]; const ej = incentivoDe(cfg, num(cfg.umbral), 400); return (<>
          <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 4 }}>Ajustes</div>
          <div style={{ fontSize: 12, color: C.t2, marginBottom: 14 }}>Adapta la app a lo que te paga tu empresa. Se guarda en este móvil.</div>
          <div style={{ ...card, padding: 16, marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: C.t2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Tu porcentaje</div>
            <label htmlFor="cfgPct" style={{ fontSize: 12, color: C.t2, fontWeight: 600, marginBottom: 5, display: "block" }}>Qué % de la facturación te llevas</label>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input className="inp" type="number" min="0" max="100" step="0.5" id="cfgPct" aria-label="Porcentaje del conductor" style={{ ...inp, flex: 1 }} value={cfg.pctConductor} onChange={(e) => set("pctConductor", e.target.value)} />
              <span style={{ fontSize: 20, fontWeight: 900, color: C.accDim }}>%</span>
            </div>
          </div>
          <div style={{ ...card, padding: 16, marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: C.t2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Incentivo por facturación</div>
            <div style={{ display: "flex", gap: 7, marginBottom: 14 }}>
              {tipos.map(([v, lb]) => { const on = cfg.incentivo === v; return (
                <button key={v} className="nb" onClick={() => set("incentivo", v)} style={{ flex: 1, padding: "9px 4px", borderRadius: 10, border: `1.5px solid ${on ? C.acc : C.border}`, background: on ? `${C.acc}18` : C.surf, color: on ? C.accDim : C.t2, fontWeight: on ? 800 : 600, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>{lb}</button>
              ); })}
            </div>
            {cfg.incentivo === "ninguno" ? <div style={{ fontSize: 12, color: C.t3 }}>Tu empresa no te da ningún extra por facturación.</div> : <>
              <label htmlFor="cfgUmbral" style={{ fontSize: 12, color: C.t2, fontWeight: 600, marginBottom: 5, display: "block" }}>A partir de cuánto facturado al mes (€)</label>
              <input className="inp" type="number" min="0" step="50" id="cfgUmbral" aria-label="Umbral de facturación" placeholder="0" style={{ ...inp, marginBottom: 12 }} value={cfg.umbral} onChange={(e) => set("umbral", e.target.value)} />
              {cfg.incentivo === "bono" ? <>
                <label htmlFor="cfgBono" style={{ fontSize: 12, color: C.t2, fontWeight: 600, marginBottom: 5, display: "block" }}>Te dan de bono (€)</label>
                <input className="inp" type="number" min="0" step="5" id="cfgBono" aria-label="Importe del bono" placeholder="0" style={inp} value={cfg.bonoImporte} onChange={(e) => set("bonoImporte", e.target.value)} />
              </> : <>
                <label htmlFor="cfgPctComb" style={{ fontSize: 12, color: C.t2, fontWeight: 600, marginBottom: 5, display: "block" }}>Te pagan este % del combustible</label>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <input className="inp" type="number" min="0" max="100" step="1" id="cfgPctComb" aria-label="Porcentaje del combustible" placeholder="0" style={{ ...inp, flex: 1 }} value={cfg.pctCombustible} onChange={(e) => set("pctCombustible", e.target.value)} />
                  <span style={{ fontSize: 20, fontWeight: 900, color: C.accDim }}>%</span>
                </div>
              </>}
            </>}
          </div>
          <div style={{ background: `${C.acc}10`, border: `1px solid ${C.acc}30`, borderRadius: 16, padding: 16, marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: C.accDim, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Así queda tu acuerdo</div>
            <div style={{ fontSize: 13, color: C.t1, lineHeight: 1.6 }}>Te llevas el <strong>{pct}%</strong> de todo lo que factures.{ej.tipo === "incompleto" ? <> Te falta rellenar los dos datos del incentivo para que cuente.</> : cfg.incentivo === "bono" ? <> Al pasar de <strong>{fmt0(num(cfg.umbral))}</strong> en el mes, te dan <strong>{fmt0(num(cfg.bonoImporte))}</strong> de bono.</> : cfg.incentivo === "combustible" ? <> Al pasar de <strong>{fmt0(num(cfg.umbral))}</strong> en el mes, te pagan el <strong>{num(cfg.pctCombustible)}%</strong> del combustible (con {fmt0(400)} de gasolina serían {fmt(ej.importe)}).</> : <> Sin extras por facturación.</>}</div>
          </div>
          <div style={{ ...card, padding: 16, marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: C.t2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Con qué aplicaciones trabajas</div>
            <div style={{ fontSize: 12.5, color: C.t2, lineHeight: 1.5, marginBottom: 6 }}>Enciende solo las que uses: las demás desaparecen del parte diario. Apagar una <strong>no borra nada</strong>, lo que ya tengas apuntado sigue contando en tus meses.</div>
            {plats.map((pl) => (
              <div key={pl.key} style={{ display: "flex", alignItems: "center", gap: 10, borderTop: "1px solid #eef0f6", padding: "11px 0" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 800, color: pl.activa ? C.t1 : C.t3, wordBreak: "break-word" }}>{pl.nombre}</div>
                  <div style={{ fontSize: 10.5, color: C.t3, marginTop: 2, lineHeight: 1.35 }}>{pl.tipo === "cobrado" ? "2ª casilla: lo que ya cobró la empresa" : "2ª casilla: lo que cobras tú en mano"}</div>
                </div>
                {!pl.base && !platConDatos(pl) && (
                  <button className="nb" onClick={() => quitarPlat(pl.key)} aria-label={`Quitar ${pl.nombre}`} style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 9, border: `1px solid ${C.red}33`, background: `${C.red}0e`, color: C.red, fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", lineHeight: 1 }}>×</button>
                )}
                <button className="nb" role="switch" aria-checked={pl.activa} aria-label={pl.nombre} onClick={() => togglePlat(pl.key)} style={{ flexShrink: 0, width: 46, height: 27, borderRadius: 14, border: "none", padding: 3, cursor: "pointer", background: pl.activa ? C.green : "#ccd1e0", display: "flex", justifyContent: pl.activa ? "flex-end" : "flex-start", alignItems: "center", transition: "background .15s" }}>
                  <span style={{ display: "block", width: 21, height: 21, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.25)" }} />
                </button>
              </div>
            ))}
            <div style={{ borderTop: `1.5px solid ${C.border}`, marginTop: 4, paddingTop: 13 }}>
              <label htmlFor="appNueva" style={{ fontSize: 12, color: C.t2, fontWeight: 700, marginBottom: 3, display: "block" }}>Añadir otra aplicación o emisora</label>
              <div style={{ fontSize: 10.5, color: C.t3, marginBottom: 7, lineHeight: 1.4 }}>Por ejemplo: RTI, Teletaxi, Radio Teléfono Taxi.</div>
              <input className="inp" id="appNueva" type="text" maxLength={24} placeholder="Escribe el nombre" style={{ ...inp, fontSize: 14, marginBottom: 9 }} value={appNueva.nombre} onChange={(e) => setAppNueva((a) => ({ ...a, nombre: e.target.value }))} />
              <div style={{ fontSize: 11.5, color: C.t2, fontWeight: 600, marginBottom: 6 }}>¿Qué vas a apuntar en la segunda casilla?</div>
              <div style={{ display: "flex", gap: 7, marginBottom: 11 }}>
                {[["efectivo", "Lo que cobro en mano"], ["cobrado", "Lo que cobra la empresa"]].map(([t, etiqueta]) => (
                  <button key={t} className="nb" onClick={() => setAppNueva((a) => ({ ...a, tipo: t }))} aria-pressed={appNueva.tipo === t} style={{ flex: 1, padding: "9px 8px", borderRadius: 10, border: `1.5px solid ${appNueva.tipo === t ? C.acc : C.border}`, background: appNueva.tipo === t ? `${C.acc}1c` : C.surf, color: appNueva.tipo === t ? C.accDim : C.t2, fontWeight: 700, fontSize: 11.5, cursor: "pointer", fontFamily: "inherit", lineHeight: 1.3 }}>{etiqueta}</button>
                ))}
              </div>
              <button className="saveBtn" onClick={addPlat} disabled={!appNueva.nombre.trim()} style={{ width: "100%", padding: 11, borderRadius: 10, border: "none", background: appNueva.nombre.trim() ? `linear-gradient(135deg,${C.acc},${C.accDim})` : "#e7eaf2", color: appNueva.nombre.trim() ? "#0d0f14" : C.t3, fontWeight: 800, fontSize: 13, cursor: appNueva.nombre.trim() ? "pointer" : "default", fontFamily: "inherit" }}>Añadir aplicación</button>
            </div>
          </div>
          <div style={{ ...card, padding: 16, marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: C.t2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Copia de seguridad</div>
        <div style={{ fontSize: 12.5, color: C.t2, lineHeight: 1.5, marginBottom: 12 }}>Tus cuentas se guardan solo en este móvil. Si lo pierdes o desinstalas la app, se van contigo. Guarda una copia de vez en cuando.</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="saveBtn" onClick={exportarCopia} style={{ flex: 1, padding: 11, borderRadius: 10, border: "none", background: `linear-gradient(135deg,${C.acc},${C.accDim})`, color: "#0d0f14", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Exportar copia</button>
          <button className="nb" onClick={() => document.getElementById("tcImport").click()} style={{ flex: 1, padding: 11, borderRadius: 10, border: `1px solid ${C.border}`, background: C.surf, color: C.t2, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Importar copia</button>
        </div>
        <input id="tcImport" type="file" accept="application/json,.json" style={{ display: "none" }} onChange={(e) => { leerCopia(e.target.files && e.target.files[0]); e.target.value = ""; }} />
        {copiaMsg && <div style={{ marginTop: 10, fontSize: 12, color: C.t2 }}>{copiaMsg}</div>}
        {copia && <div style={{ marginTop: 12, background: `${C.red}0e`, border: `1.5px solid ${C.red}44`, borderRadius: 12, padding: 13 }}>
          <div style={{ fontSize: 13, color: C.t1, lineHeight: 1.55 }}>La copia tiene <strong>{copia.dias} {copia.dias === 1 ? "día" : "días"}</strong>{copia.desde ? <> ({dayMonth(copia.desde)} – {dayMonth(copia.hasta)})</> : null} y {copia.gastos} {copia.gastos === 1 ? "gasto" : "gastos"}.</div>
          <div style={{ fontSize: 12.5, color: C.red, fontWeight: 700, margin: "7px 0 11px" }}>Ahora tienes {Object.keys(days).length} días guardados. Al restaurar se reemplazan por los de la copia.</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="saveBtn" onClick={restaurarCopia} style={{ flex: 1, padding: 10, borderRadius: 10, border: "none", background: C.red, color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Restaurar</button>
            <button className="nb" onClick={() => setCopia(null)} style={{ flex: 1, padding: 10, borderRadius: 10, border: `1px solid ${C.border}`, background: C.surf, color: C.t2, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Cancelar</button>
          </div>
        </div>}
      </div>
      <button className="saveBtn" onClick={() => setCfg((c) => ({ ...DEFAULT_CFG, plataformas: c.plataformas }))} style={{ width: "100%", padding: 12, borderRadius: 12, border: `1px solid ${C.border}`, background: C.surf, color: C.t2, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Restaurar valores por defecto</button>
      <div style={{ textAlign: "center", fontSize: 11, color: C.t3, margin: "14px 0 20px" }}>
        <a href="./privacidad.html" target="_blank" rel="noopener" style={{ color: C.accDim, fontWeight: 700, textDecoration: "none", fontSize: 12 }}>Política de privacidad</a>
        <div style={{ marginTop: 7 }}>TXpro · versión {APP_VERSION}</div>
        <div style={{ marginTop: 3 }}>Tus datos se guardan solo en este móvil.</div>
      </div>
        </>); })()}
        {view === "periodo" && (() => { const lo = rangeFrom <= rangeTo ? rangeFrom : rangeTo; const hi = rangeFrom <= rangeTo ? rangeTo : rangeFrom; const { rows, totalFact, conductorMes, totalCobradoEmpresa, diferenciaMes, efectivoMes, diasTrabajados, mediaDiaria, gastos: gastosPeriodo } = rangeData; const atajos = [["Esta semana", weekStart(today), today], ["Últimos 7 días", shiftDays(today, -6), today], ["Este mes", monthStart(today), today]]; return (<>
          <div style={{ ...card, padding: 16, marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: C.t2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Elige el periodo</div>
            <div style={{ display: "flex", gap: 7, marginBottom: 14 }}>
              {atajos.map(([lb, f, t]) => { const on = rangeFrom === f && rangeTo === t; return (
                <button key={lb} className="nb" onClick={() => { setRangeFrom(f); setRangeTo(t); }} style={{ flex: 1, padding: "9px 4px", borderRadius: 10, border: `1.5px solid ${on ? C.acc : C.border}`, background: on ? `${C.acc}18` : C.surf, color: on ? C.accDim : C.t2, fontWeight: on ? 800 : 600, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>{lb}</button>
              ); })}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ minWidth: 0 }}><label htmlFor="rangoDesde" style={{ fontSize: 12, color: C.t2, fontWeight: 600, marginBottom: 5, display: "block" }}>Desde</label><input type="date" id="rangoDesde" aria-label="Desde" className="inp" style={{ ...inp, fontSize: 13 }} value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} /></div>
              <div style={{ minWidth: 0 }}><label htmlFor="rangoHasta" style={{ fontSize: 12, color: C.t2, fontWeight: 600, marginBottom: 5, display: "block" }}>Hasta</label><input type="date" id="rangoHasta" aria-label="Hasta" className="inp" style={{ ...inp, fontSize: 13 }} value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} /></div>
            </div>
          </div>
          {(() => { const largo = daysBetween(lo, hi).length; const mover = (n) => { setRangeFrom(shiftDays(lo, n * largo)); setRangeTo(shiftDays(hi, n * largo)); }; const flecha = { background: C.surf, border: `1px solid ${C.border}`, borderRadius: 10, width: 34, height: 34, fontSize: 17, color: C.t2, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }; return (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12 }}>
              <button className="nb" onClick={() => mover(-1)} aria-label="Periodo anterior" style={flecha}>‹</button>
              <div style={{ fontSize: 14, fontWeight: 800, color: C.t1, textAlign: "center" }}>Del {dayMonth(lo)} al {dayMonth(hi)}<div style={{ fontSize: 11, color: C.t2, fontWeight: 600 }}>{diasTrabajados} {diasTrabajados === 1 ? "día trabajado" : "días trabajados"}</div></div>
              <button className="nb" onClick={() => mover(1)} aria-label="Periodo siguiente" style={flecha}>›</button>
            </div>
          ); })()}
          {diasTrabajados === 0 ? <div style={{ color: C.t2, textAlign: "center", padding: 32, fontSize: 14 }}>Sin días registrados en este periodo.</div> : <>
            <Hero total={totalFact} conductor={conductorMes} pct={pct} />
            <Desglose entries={Object.entries(days).filter(([d]) => d >= lo && d <= hi)} plats={plats} etiqueta={`del ${dayMonth(lo)} al ${dayMonth(hi)}`} />
            {(() => { const porDia = Object.fromEntries(rows.map((r) => [r.date, r.s.facturacion])); const cal = daysBetween(lo, hi); const tope = Math.max(1, ...cal.map((d) => porDia[d] || 0)); return (
              <div style={{ ...card, padding: 16, marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: C.t2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 14 }}>Facturación por día</div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
                  {cal.map((d) => { const v = porDia[d] || 0; return (
                    <div key={d} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, minWidth: 34, flexShrink: 0 }}>
                      <div style={{ fontSize: 9, color: C.t3, fontWeight: 700, whiteSpace: "nowrap", height: 12 }}>{v > 0 ? Math.round(v) + "€" : ""}</div>
                      <div style={{ height: 90, display: "flex", alignItems: "flex-end" }}><div style={{ width: 22, height: v > 0 ? Math.max(5, (v / tope) * 90) : 0, borderRadius: 5, background: `linear-gradient(180deg,${C.acc},${C.accDim})` }} /></div>
                      <div style={{ fontSize: 11, fontWeight: 800, color: v > 0 ? C.t1 : C.t3 }}>{Number(d.slice(8))}</div>
                      <div style={{ fontSize: 9, color: C.t3 }}>{weekday(d)}</div>
                    </div>
                  ); })}
                </div>
              </div>
            ); })()}
            <StatCard title="Resumen del periodo" items={[{ label: `Media diaria (${diasTrabajados} ${diasTrabajados === 1 ? "día" : "días"})`, val: mediaDiaria, color: C.t1 }, { label: `${pct}% conductor s/ facturación base`, val: conductorMes, color: C.accDim, bold: true }, { label: "Cobrado por empresa (acumulado periodo)", val: totalCobradoEmpresa, color: C.t1 }, { label: "Efectivo cobrado por el conductor", val: efectivoMes, color: C.blue }, ...(gastosPeriodo.total > 0 ? [{ label: "Gastos del periodo", val: gastosPeriodo.total, color: C.red, neg: true }] : []), ...(gastosPeriodo.reembolsable > 0 ? [{ label: "Gastos que te devuelve la empresa", val: gastosPeriodo.reembolsable, color: C.green }] : [])]} />
            <JornadaResumen j={rangeData.jornada} pct={pct} />
            <Balance value={diferenciaMes} sub={gastosPeriodo.reembolsable > 0 ? "Balance del periodo · incluye los gastos a devolver" : "Balance del periodo seleccionado"} />
            <DayTable rows={rows} pct={pct} />
          </>}
        </>); })()}
      </div>
      <nav style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: C.surf, borderTop: `1px solid ${C.border}`, display: "flex", zIndex: 20, boxShadow: "0 -2px 14px rgba(30,34,54,0.08)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        {[["diario", "Diario"], ["objetivos", "Objetivos"], ["gastos", "Gastos"], ["calendario", "Calendario"], ["mensual", "Mensual"], ["periodo", "Periodo"]].map(([v, lb]) => (
          <button key={v} className="nb" onClick={() => setView(v)} style={{ flex: 1, padding: "12px 0 10px", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, background: "none", border: "none", borderTop: `2px solid ${view === v ? C.acc : "transparent"}`, cursor: "pointer", color: view === v ? C.accDim : C.t3, fontWeight: view === v ? 800 : 500, fontSize: 10, fontFamily: "inherit", transition: "color 0.15s, border-color 0.15s" }}>
            <Icono name={v} />{lb}
          </button>
        ))}
      </nav>
    </div>
  );
}
ReactDOM.createRoot(document.getElementById("root")).render(<TXpro />);
