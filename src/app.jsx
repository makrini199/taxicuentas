const { useState, useMemo, useEffect } = React;
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
const DEFAULT_CFG = { pctConductor: 50, incentivo: "ninguno", umbral: "", bonoImporte: "", pctCombustible: "", plataformas: [] };
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
const loadCfg = () => { const g = loadStorage("tc_cfg", {}); return { ...DEFAULT_CFG, ...g, plataformas: normPlataformas(g && g.plataformas) }; };
const num = (v) => Number(v) || 0;
const incentivoDe = (cfg, totalFact, combustible) => { const meta = num(cfg.umbral); const llega = totalFact >= meta; if (cfg.incentivo === "bono") { const importe = num(cfg.bonoImporte); if (meta <= 0 || importe <= 0) return { tipo: "incompleto", llega: false, importe: 0 }; return { tipo: "bono", llega, importe: llega ? importe : 0, etiqueta: `Bono al superar ${fmt0(meta)}`, pendiente: `Faltan ${fmt(Math.max(0, meta - totalFact))} para el bono de ${fmt0(importe)}`, logrado: `¡Superados los ${fmt0(meta)}! Bono de ${fmt0(importe)} desbloqueado` }; } if (cfg.incentivo === "combustible") { const pc = num(cfg.pctCombustible); if (meta <= 0 || pc <= 0) return { tipo: "incompleto", llega: false, importe: 0 }; return { tipo: "combustible", llega, importe: llega ? combustible * (pc / 100) : 0, etiqueta: `${pc}% del combustible`, pendiente: `Faltan ${fmt(Math.max(0, meta - totalFact))} para que te paguen el ${pc}% del combustible`, logrado: `¡Superados los ${fmt0(meta)}! Te pagan el ${pc}% del combustible` }; } return { tipo: "ninguno", llega: false, importe: 0 }; };
const summarize = (entries, pct = 50, plats = PLATAFORMAS_BASE) => { let acum = 0; const rows = entries.map(([date, d]) => { const s = calcDay(d, pct, plats); acum += s.facturacion; return { date, s, acumFact: acum }; }); const conductor = acum * (pct / 100); const cobrado = rows.reduce((a, r) => a + r.s.cobradoEmpresa, 0); const efectivo = rows.reduce((a, r) => a + (r.s.facturacion - r.s.cobradoEmpresa), 0); const dias = rows.length; return { rows, totalFact: acum, conductorMes: conductor, totalCobradoEmpresa: cobrado, diferenciaMes: conductor - cobrado, efectivoMes: efectivo, diasTrabajados: dias, mediaDiaria: dias ? acum / dias : 0 }; };
const clavesDia = (plats) => ["taximetro", "visa", ...plats.flatMap((p) => [p.key, p.cobKey])];
const EMPTY = { taximetro: 0, uber: 0, uberEfec: 0, cabify: 0, cabifyEfec: 0, bolt: 0, boltEfec: 0, fnt9: 0, fncob: 0, visa: 0 };
const EFEC_TRIOS = [["uber", "uberEfec", "uberCob"], ["cabify", "cabifyEfec", "cabifyCob"], ["bolt", "boltEfec", "boltCob"]];
const today = todayStr();
const loadStorage = (key, fallback) => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } };
const hasData = (d) => !!d && typeof d === "object" && Object.values(d).some((v) => (Number(v) || 0) !== 0);
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
const EVENTOS_HORAS = 12;              // cada cuánto se vuelve a mirar
const EVENTOS_MAX = 400;
const EVENTOS_DIAS_MAX = 15;           // lo que dura una feria larga
const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;
// El archivo es nuestro, pero se lee como si no lo fuera: si algún día sale
// mal generado, la app tiene que seguir abriendo igual y sin días inventados.
const limpiarEventos = (crudo) => {
  if (!crudo || !Array.isArray(crudo.eventos)) return null;
  const out = [];
  for (const e of crudo.eventos) {
    if (!e || typeof e !== "object") continue;
    if (!ES_FECHA.test(e.fecha) || typeof e.titulo !== "string" || !e.titulo.trim()) continue;
    const hasta = ES_FECHA.test(e.hasta) && e.hasta >= e.fecha ? e.hasta : e.fecha;
    out.push({ fecha: e.fecha, hasta, titulo: String(e.titulo).slice(0, 60), lugar: e.lugar ? String(e.lugar).slice(0, 40) : "", nota: e.nota ? String(e.nota).slice(0, 160) : "" });
    if (out.length >= EVENTOS_MAX) break;
  }
  return { actualizado: ES_FECHA.test(crudo.actualizado) ? crudo.actualizado : "", eventos: out };
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
  return mapa;
};
const C = { bg: "#f5f6fa", surf: "#ffffff", border: "#e3e6f0", acc: "#f0c040", accDim: "#8a6a17", green: "#189a5f", red: "#d63b3b", blue: "#2f6fe0", evento: "#8b5cf6", t1: "#1a1d29", t2: "#5c6178", t3: "#8f93a8" };
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
  const [form, setForm] = useState(() => { const s = loadDays(); return s[today] ? { ...s[today] } : { ...EMPTY }; });
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
  const [eventos, setEventos] = useState(() => limpiarEventos(loadStorage(EVENTOS_KEY, null)) || { actualizado: "", eventos: [] });
  // Lo guardado se pinta ya; la red solo sirve para refrescarlo. Si falla, no
  // pasa nada: el conductor sigue viendo el último calendario que le llegó.
  useEffect(() => {
    const visto = loadStorage(EVENTOS_KEY + "_visto", 0);
    if (typeof visto === "number" && Date.now() - visto < EVENTOS_HORAS * 3600000) return;
    let vivo = true;
    fetch("./eventos.json", { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((crudo) => {
        const limpio = limpiarEventos(crudo);
        if (!limpio || !vivo) return;
        setEventos(limpio);
        try { localStorage.setItem(EVENTOS_KEY, JSON.stringify(limpio)); localStorage.setItem(EVENTOS_KEY + "_visto", JSON.stringify(Date.now())); } catch {}
      })
      .catch(() => {});
    return () => { vivo = false; };
  }, []);
  const eventosPorDia = useMemo(() => indexarEventos(eventos.eventos), [eventos]);
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
  useEffect(() => { try { localStorage.setItem("tc_gastos", JSON.stringify(gastos)); } catch {} }, [gastos]);
  useEffect(() => { try { localStorage.setItem("tc_notas", JSON.stringify(notas)); } catch {} }, [notas]);
  const ponerNota = (fecha, texto) => setNotas((prev) => { const next = { ...prev }; if (texto.trim()) next[fecha] = texto.slice(0, 120); else delete next[fecha]; return next; });
  useEffect(() => { try { localStorage.setItem("tc_cfg", JSON.stringify(cfg)); } catch {} }, [cfg]);
  const saveDay = () => { const parsed = {}; for (const k of clavesDia(plats)) parsed[k] = parseFloat(form[k]) || 0; const vacio = !hasData(parsed); setDays((prev) => { const next = { ...prev }; if (vacio) delete next[editDate]; else next[editDate] = parsed; return next; }); setSaved(vacio ? "borrado" : "guardado"); setTimeout(() => setSaved(false), 2000); };
  const changeDate = (d) => { setEditDate(d); setForm(days[d] ? { ...days[d] } : { ...EMPTY }); };
  const dayStats = useMemo(() => { const raw = {}; for (const k of clavesDia(plats)) raw[k] = parseFloat(form[k]) || 0; return calcDay(raw, pct, plats); }, [form, pct, plats]);
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
    if (datos.cfg && typeof datos.cfg === "object") { setCfg({ ...DEFAULT_CFG, ...datos.cfg, plataformas: normPlataformas(datos.cfg.plataformas) }); marcarCfgOk(); }
    setForm(limpios[editDate] ? { ...limpios[editDate] } : { ...EMPTY });
    setCopia(null);
    setCopiaMsg(`Restaurados ${Object.keys(limpios).length} días.`);
  };
  const ANCHO = 84;
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
              <div key={f.key} style={{ display: "flex", alignItems: "center", gap: 7, borderTop: "1px solid #eef0f6", padding: "10px 0" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {f.oro && <TaxiLogo size={18} color={C.acc} />}
                    <span style={{ fontSize: 13.5, fontWeight: 800, color: f.oro ? "#c08a06" : C.t1, lineHeight: 1.2, wordBreak: "break-word" }}>{f.nombre}</span>
                  </div>
                  {f.cobrado && <div style={{ fontSize: 9.5, fontWeight: 700, color: C.green, marginTop: 3 }}>2ª casilla: ya cobrado</div>}
                </div>
                <input className="inp" type="number" min="0" step="0.01" placeholder="0.00" aria-label={f.nombre} style={{ ...inp, width: ANCHO, flexShrink: 0, padding: "9px 10px", fontSize: 14, textAlign: "right" }} value={form[f.key] || ""} onChange={(e) => setForm((v) => ({ ...v, [f.key]: e.target.value }))} />
                {f.cobKey
                  ? <input className="inp" type="number" min="0" step="0.01" placeholder="0.00" aria-label={`${f.nombre}, ${f.cobrado ? "ya cobrado" : "cobrado en efectivo"}`} style={{ ...inp, width: ANCHO, flexShrink: 0, padding: "9px 10px", fontSize: 14, textAlign: "right", background: f.cobrado ? `${C.green}0d` : `${C.blue}0d`, borderColor: f.cobrado ? `${C.green}38` : `${C.blue}38` }} value={form[f.cobKey] || ""} onChange={(e) => setForm((v) => ({ ...v, [f.cobKey]: e.target.value }))} />
                  : <div style={{ width: ANCHO, flexShrink: 0 }} />}
              </div>
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
          <button className="saveBtn" onClick={saveDay} style={{ width: "100%", padding: 14, borderRadius: 12, border: "none", background: `linear-gradient(135deg,${C.acc},${C.accDim})`, color: "#0d0f14", fontWeight: 900, fontSize: 15, cursor: "pointer", fontFamily: "inherit", boxShadow: `0 4px 16px ${C.acc}38` }}>Guardar día</button>
        </>}
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
                    <button key={f} className="nb" onClick={() => setCalDia(f)} aria-label={`${f}${fact > 0 ? `, ${fmt(fact)}` : ", sin datos"}${eventosPorDia[f] ? `, ${eventosPorDia[f].map((e) => e.titulo).join(", ")}` : ""}`} style={{
                      aspectRatio: "1 / 1", borderRadius: 9, cursor: "pointer", fontFamily: "inherit", padding: 2,
                      border: elegido ? `2px solid ${C.accDim}` : esHoy ? `1.5px solid ${C.acc}` : `1px solid ${C.border}`,
                      background: fact > 0 ? `rgba(240,192,64,${intensidad})` : C.surf,
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1, position: "relative",
                    }}>
                      <span style={{ fontSize: 12.5, fontWeight: esHoy || elegido ? 900 : 600, color: fact > 0 ? C.t1 : C.t3 }}>{Number(f.slice(8))}</span>
                      {fact > 0 && <span style={{ fontSize: 8.5, fontWeight: 700, color: C.accDim, lineHeight: 1 }}>{Math.round(fact)}</span>}
                      {notas[f] && <span style={{ position: "absolute", top: 3, right: 3, width: 5, height: 5, borderRadius: "50%", background: C.blue }} />}
                      {eventosPorDia[f] && <span style={{ position: "absolute", top: 3, left: 3, width: 5, height: 5, borderRadius: "50%", background: C.evento }} />}
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
                    {e.nota && <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.45, marginTop: 4 }}>{e.nota}</div>}
                  </div>
                ))}
                <label htmlFor="calNota" style={{ fontSize: 12, color: C.t2, fontWeight: 600, marginBottom: 5, display: "block" }}>Nota del día</label>
                <input id="calNota" aria-label="Nota del día" className="inp" type="text" maxLength="120" placeholder="Concierto, feria, día libre…" style={{ ...inp, fontSize: 14, fontWeight: 500, marginBottom: 12 }} value={notas[sel] || ""} onChange={(e) => ponerNota(sel, e.target.value)} />
                <button className="saveBtn" onClick={() => { changeDate(sel); setView("diario"); }} style={{ width: "100%", padding: 11, borderRadius: 10, border: `1px solid ${C.border}`, background: C.surf, color: C.t2, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>{datosSel ? "Editar este día" : "Apuntar este día"}</button>
              </div>
            )}

            {(() => {
              const delMesEv = eventos.eventos.filter((e) => monthKey(e.fecha) === calMes || monthKey(e.hasta) === calMes).sort((a, b) => a.fecha.localeCompare(b.fecha));
              if (!delMesEv.length) return null;
              return (
                <div style={{ ...card, padding: 16, marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: C.t2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Días fuertes del mes</div>
                  {delMesEv.map((e, i) => (
                    <div key={i} onClick={() => { setCalDia(e.fecha); if (monthKey(e.fecha) !== calMes) setCalMes(monthKey(e.fecha)); }} style={{ display: "flex", gap: 10, padding: "9px 0", borderBottom: i === delMesEv.length - 1 ? "none" : `1px solid ${C.border}44`, cursor: "pointer" }}>
                      <div style={{ fontSize: 12.5, fontWeight: 800, color: C.evento, minWidth: 38, flexShrink: 0 }}>{dayMonth(e.fecha)}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: C.t1, fontWeight: 700 }}>{e.titulo}</div>
                        {e.lugar && <div style={{ fontSize: 11.5, color: C.t3, marginTop: 1 }}>{e.lugar}</div>}
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
                <StatCard title="Liquidación mensual" items={[{ label: `Media diaria (${diasTrabajados} ${diasTrabajados === 1 ? "día" : "días"})`, val: mediaDiaria, color: C.t1 }, { label: `${pct}% conductor s/ facturación base`, val: conductorMes, color: C.accDim, bold: true }, { label: "Cobrado por empresa (acumulado mes)", val: totalCobradoEmpresa, color: C.t1 }, { label: "Efectivo cobrado por el conductor", val: efectivoMes, color: C.blue }, ...(gastosMes.total > 0 ? [{ label: "Gastos del mes", val: gastosMes.total, color: C.red, neg: true }] : []), ...(cfg.incentivo === "combustible" && combustibleMes > 0 ? [{ label: "de ellos, combustible", val: combustibleMes, color: C.t2, neg: true }] : []), ...(gastosMes.reembolsable > 0 ? [{ label: "Gastos que te devuelve la empresa", val: gastosMes.reembolsable, color: C.green }] : []), ...(incentivo.importe > 0 ? [{ label: incentivo.etiqueta, val: incentivo.importe, color: C.green }] : [])]}>
                  {incentivo.tipo === "ninguno" ? null : incentivo.tipo === "incompleto" ? <div style={{ background: `${C.acc}08`, border: `1px solid ${C.acc}22`, borderRadius: 10, padding: "8px 12px", marginTop: 10, fontSize: 12, color: C.t2 }}>Te falta indicar tu incentivo en Ajustes</div> : incentivo.llega ? <div style={{ background: `${C.green}12`, border: `1px solid ${C.green}33`, borderRadius: 10, padding: "8px 12px", marginTop: 10, fontSize: 12, color: C.green, fontWeight: 700 }}>{incentivo.logrado}</div>
                  : <div style={{ background: `${C.acc}08`, border: `1px solid ${C.acc}22`, borderRadius: 10, padding: "8px 12px", marginTop: 10, fontSize: 12, color: C.t2 }}>{incentivo.pendiente}</div>}
                </StatCard>
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
            <Balance value={diferenciaMes} sub={gastosPeriodo.reembolsable > 0 ? "Balance del periodo · incluye los gastos a devolver" : "Balance del periodo seleccionado"} />
            <DayTable rows={rows} pct={pct} />
          </>}
        </>); })()}
      </div>
      <nav style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: C.surf, borderTop: `1px solid ${C.border}`, display: "flex", zIndex: 20, boxShadow: "0 -2px 14px rgba(30,34,54,0.08)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        {[["diario", "Diario"], ["gastos", "Gastos"], ["calendario", "Calendario"], ["mensual", "Mensual"], ["periodo", "Periodo"]].map(([v, lb]) => (
          <button key={v} className="nb" onClick={() => setView(v)} style={{ flex: 1, padding: "12px 0 10px", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, background: "none", border: "none", borderTop: `2px solid ${view === v ? C.acc : "transparent"}`, cursor: "pointer", color: view === v ? C.accDim : C.t3, fontWeight: view === v ? 800 : 500, fontSize: 10, fontFamily: "inherit", transition: "color 0.15s, border-color 0.15s" }}>
            <Icono name={v} />{lb}
          </button>
        ))}
      </nav>
    </div>
  );
}
ReactDOM.createRoot(document.getElementById("root")).render(<TXpro />);
