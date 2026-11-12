const { useState, useMemo, useEffect, useRef } = React;
const APP_VERSION = "__APP_VERSION__";
// useGrouping "always": en español los miles de cuatro cifras no llevan punto
// por defecto (2269,40 €); con esto sí (2.269,40 €), que se lee mejor.
const fmt = (n) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 2, useGrouping: "always" }).format(n);
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmt0 = (n) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" }).format(n);
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
// Cómo se reparte con la empresa: a porcentaje (un número, el % del conductor)
// o con cuota fija, como un alquiler ({ cuotaDia }: lo que se queda la empresa
// por cada día trabajado; 0 si la cuota va por mes y se resta en el mes).
// parteEmpresa es lo que le toca a la empresa; diferencia = parteEmpresa menos
// lo que ya cobró ella (apps y tarjeta): positiva, el conductor le debe;
// negativa, la empresa le debe al conductor.
const calcDay = (d, rep = 50, plats = PLATAFORMAS_BASE) => {
  const n = (v) => Number(v) || 0;
  let apps = 0;
  let empresa = n(d.visa);
  for (const p of plats) {
    const total = n(d[p.key]);
    apps += total;
    empresa += p.tipo === "cobrado" ? n(d[p.cobKey]) : total - n(d[p.cobKey]);
  }
  const facturacion = n(d.taximetro) + apps;
  const r = rep && typeof rep === "object" ? rep : { pct: Number(rep) || 0 };
  const parteEmpresa = r.cuotaDia !== undefined ? (facturacion > 0 ? Number(r.cuotaDia) || 0 : 0) : facturacion * (1 - (Number(r.pct) || 0) / 100);
  const conductor50 = facturacion - parteEmpresa;
  return { facturacion, conductor50, parteEmpresa, cobradoEmpresa: empresa, diferencia: parteEmpresa - empresa };
};
// El combustible ya no se apunta aquí: va en el Diario, día a día, que es cuando
// se reposta. Los repostajes que ya estaban en Gastos siguen contando igual.
const CONCEPTOS = ["Pinchazo", "ITV", "Lavado", "Taller", "Multa", "Parking", "Otros"];
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
// Gastos de unas fechas: los apuntados en Gastos más el combustible del Diario.
// Con esto el bono de "% del combustible" cuenta lo repostado día a día.
const combustibleDe = (d) => Math.max(0, evalSuma(d && d.combustible));
const gastosEntre = (lista, dias, desde, hasta) => {
  const g = sumarGastos(lista, desde, hasta);
  let diario = 0;
  for (const [f, d] of Object.entries(dias)) if (f >= desde && f <= hasta) diario += combustibleDe(d);
  diario = Math.round(diario * 100) / 100;
  return { ...g, total: g.total + diario, combustible: g.combustible + diario, combustibleDiario: diario };
};
const DEFAULT_CFG = { objetivos: { dia: "", semana: "", mes: "", diasTrabajo: 6 }, pctConductor: 50, modo: "porcentaje", cuota: "", cuotaPor: "dia", incentivo: "ninguno", umbral: "", bonoImporte: "", pctCombustible: "", plataformas: [] };
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
// diasTrabajo: los días que se trabaja a la semana (6 en el taxi, con su día de
// libranza). Con ellos se reparten los objetivos por días de trabajo, no de calendario.
const normObjetivos = (o) => {
  const out = Object.fromEntries(["dia", "semana", "mes"].map((k) => { const n = Number(o && o[k]); return [k, Number.isFinite(n) && n > 0 ? String(Math.round(n * 100) / 100) : ""]; }));
  const d = Math.round(Number(o && o.diasTrabajo));
  out.diasTrabajo = d >= 1 && d <= 7 ? d : 6;
  return out;
};
const loadCfg = () => { const g = loadStorage("tc_cfg", {}); return { ...DEFAULT_CFG, ...g, plataformas: normPlataformas(g && g.plataformas), objetivos: normObjetivos(g && g.objetivos) }; };
const num = (v) => Number(v) || 0;
const incentivoDe = (cfg, totalFact, combustible) => { const meta = num(cfg.umbral); const llega = totalFact >= meta; if (cfg.incentivo === "bono") { const importe = num(cfg.bonoImporte); if (meta <= 0 || importe <= 0) return { tipo: "incompleto", llega: false, importe: 0 }; return { tipo: "bono", llega, importe: llega ? importe : 0, etiqueta: `Bono al superar ${fmt0(meta)}`, pendiente: `Faltan ${fmt(Math.max(0, meta - totalFact))} para el bono de ${fmt0(importe)}`, logrado: `¡Superados los ${fmt0(meta)}! Bono de ${fmt0(importe)} desbloqueado` }; } if (cfg.incentivo === "combustible") { const pc = num(cfg.pctCombustible); if (meta <= 0 || pc <= 0) return { tipo: "incompleto", llega: false, importe: 0 }; return { tipo: "combustible", llega, importe: llega ? combustible * (pc / 100) : 0, etiqueta: `${pc}% del combustible`, pendiente: `Faltan ${fmt(Math.max(0, meta - totalFact))} para que te paguen el ${pc}% del combustible`, logrado: `¡Superados los ${fmt0(meta)}! Te pagan el ${pc}% del combustible` }; } return { tipo: "ninguno", llega: false, importe: 0 }; };
// cuotaPeriodo: la cuota fija mensual que toca a este periodo (0 si no hay).
// Para el "por hora" se reparte entre los días trabajados (o cuotaPorDia).
const summarize = (entries, rep = 50, plats = PLATAFORMAS_BASE, cuotaPeriodo = 0, cuotaPorDia = null) => { let acum = 0; const rows = entries.map(([date, d]) => { const s = calcDay(d, rep, plats); acum += s.facturacion; return { date, s, acumFact: acum }; }); const conductor = rows.reduce((a, r) => a + r.s.conductor50, 0) - cuotaPeriodo; const parteEmpresa = rows.reduce((a, r) => a + r.s.parteEmpresa, 0) + cuotaPeriodo; const cobrado = rows.reduce((a, r) => a + r.s.cobradoEmpresa, 0); const efectivo = rows.reduce((a, r) => a + (r.s.facturacion - r.s.cobradoEmpresa), 0); const dias = rows.length; const cuotaDiaria = cuotaPorDia !== null ? cuotaPorDia : dias ? cuotaPeriodo / dias : 0; const jornada = { min: 0, diasConHoras: 0, ganadoConHoras: 0, carreras: 0, factConCarreras: 0, propinas: 0 };
  entries.forEach(([, d], i) => { const s = rows[i].s; const min = minutosJornada(d); const prop = propinasDe(d); const car = carrerasDe(d); jornada.propinas += prop; if (car) { jornada.carreras += car; jornada.factConCarreras += s.facturacion; } if (min) { jornada.min += min; jornada.diasConHoras++; jornada.ganadoConHoras += s.conductor50 - cuotaDiaria + prop; } });
  return { rows, totalFact: acum, conductorMes: conductor, parteEmpresaMes: parteEmpresa, cuotaPeriodo, totalCobradoEmpresa: cobrado, diferenciaMes: parteEmpresa - cobrado, efectivoMes: efectivo, diasTrabajados: dias, mediaDiaria: dias ? acum / dias : 0, jornada }; };
// La cuota mensual que toca a un periodo cualquiera: la parte proporcional de
// cada mes según los días del calendario que caen dentro.
const cuotaMensualEntre = (cuota, lo, hi) => {
  let total = 0, f = lo;
  while (cuota > 0 && f <= hi) {
    const [y, m] = f.split("-").map(Number); const diasMes = new Date(y, m, 0).getDate();
    const fin = `${f.slice(0, 7)}-${String(diasMes).padStart(2, "0")}`; const hasta = fin < hi ? fin : hi;
    total += (cuota * (Number(hasta.slice(8)) - Number(f.slice(8)) + 1)) / diasMes; f = shiftDays(hasta, 1);
  }
  return total;
};
const clavesDia = (plats) => ["taximetro", "visa", ...plats.flatMap((p) => [p.key, p.cobKey])];
// En el Diario el taxímetro se puede apuntar de dos maneras, y las dos casillas
// van enlazadas: la Tarjeta (el cierre del datáfono: lo demás es efectivo) o el
// efectivo del taxímetro (lo demás es tarjeta). Lo que se guarda es siempre la
// tarjeta (visa); taxEfec solo vive mientras se escribe, cuando manda el efectivo.
const tarjetaDe = (d) => { const v = Math.round((Math.max(0, evalSuma(d.taximetro)) - Math.max(0, evalSuma(d.taxEfec))) * 100) / 100; return v > 0 ? v : 0; };
const conTarjeta = (d) => (!d || d.taxEfec === undefined || String(d.taxEfec).trim() === "" ? d : { ...d, visa: tarjetaDe(d) });
// Lo que queda en efectivo del taxímetro cuando lo apuntado es la tarjeta.
const efectivoTaxi = (d) => { const t = Math.max(0, evalSuma(d.taximetro)); if (t <= 0) return ""; return String(Math.max(0, Math.round((t - Math.max(0, evalSuma(d.visa))) * 100) / 100)); };
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
// A dónde llegan las ideas y los fallos. Es el mismo correo que figura en
// Play Console para los probadores.
const CORREO_COMENTARIOS = "proyecto.txpro@gmail.com";
// El grupo de WhatsApp de los conductores. No hay foro dentro de la app: para
// hablar entre compañeros está el grupo, y aquí solo va su enlace.
const GRUPO_WHATSAPP = "https://chat.whatsapp.com/BF8BL89IBtE8BcqoRXg413";
const enlaceComentarios = () => `mailto:${CORREO_COMENTARIOS}?subject=${encodeURIComponent(`TXpro ${APP_VERSION} · Ideas o fallos`)}&body=${encodeURIComponent("Cuéntanos qué te falta, qué cambiarías o qué ha fallado:\n\n")}`;
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
// En iPhone no hay tienda que valga mientras no estemos en la App Store, pero
// Safari instala la web como app: icono en la pantalla de inicio, pantalla
// completa y sin conexión. El aviso enseña cómo, con el mismo "Más tarde".
// El iPad moderno se presenta como un Mac, así que se le reconoce por la
// pantalla táctil.
const AVISO_IOS_KEY = "tc_aviso_ios";
const esIOS = () => { try { const ua = navigator.userAgent || ""; return /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1); } catch { return false; } };
const avisoIOSSilenciado = () => { const t = loadStorage(AVISO_IOS_KEY, 0); return typeof t === "number" && Date.now() - t < AVISO_PLAY_DIAS * 86400000; };
const tocaAvisarDeIOS = () => esIOS() && !enAppInstalada() && !avisoIOSSilenciado();
// El botón de compartir de Safari: un cuadrado con una flecha hacia arriba.
const IconoCompartir = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ verticalAlign: "-2px" }}><path d="M12 3v12" /><path d="M8 7l4-4 4 4" /><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" /></svg>
);

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
// El descanso (minutos de pausa, sale del cronómetro) se descuenta de la jornada.
const descansoDe = (d) => { const n = Math.round(Number(d && d.descanso)); return Number.isFinite(n) && n > 0 ? n : 0; };
const minutosJornada = (d) => {
  if (!d || !ES_HORA.test(d.inicio || "") || !ES_HORA.test(d.fin || "")) return 0;
  const m = minutosDe(d.fin) - minutosDe(d.inicio);
  const bruto = m > 0 ? m : m < 0 ? m + 1440 : 0;
  return Math.max(0, bruto - descansoDe(d));
};
// EL CRONÓMETRO DE LA JORNADA: "Empezar", "Pausa", "Seguir" y "Terminar" rellenan
// solos la hora de empezar, la de terminar y el descanso del día en que se
// empezó (de 18:00 a 03:00 cuenta para el día de las 18:00). Se guarda aparte
// para que siga corriendo aunque se cierre la app.
const RELOJ_KEY = "tc_reloj";
const relojValido = (r) => r && typeof r === "object" && /^\d{4}-\d{2}-\d{2}$/.test(r.fecha) && Number.isFinite(r.inicio) && Number.isFinite(r.pausado) ? r : null;
const horaDe = (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const minutosReloj = (r, ahora) => (r ? Math.max(0, Math.round((ahora - r.inicio - r.pausado - (r.pausaDesde ? ahora - r.pausaDesde : 0)) / 60000)) : 0);
const lunesDe = (f) => shiftDays(f, -WD.indexOf(weekday(f)));
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
// COLORES · claro y oscuro
//
// La app pinta con C.* en cada render, así que cambiar de tema es cambiar los
// valores de C (y de card, que sale de C) antes de pintar. El tema es cosa del
// móvil, no de las cuentas: va en su propia clave y no viaja en las copias.
// "auto" sigue al modo oscuro del teléfono.
const PALETAS = {
  claro: { bg: "#f5f6fa", surf: "#ffffff", border: "#e3e6f0", acc: "#f0c040", accDim: "#8a6a17", green: "#189a5f", red: "#d63b3b", blue: "#2f6fe0", evento: "#8a6a17", t1: "#1a1d29", t2: "#5c6178", t3: "#8f93a8",
    inp: "#f6f7fb", cabecera: "#eef0f7", linea: "#eef0f6", apagado: "#e7eaf2", sombra: "0 2px 10px rgba(30,34,54,0.08)",
    mapaFondo: "#e8ebf2", mapaTierra: "#ffffff", mapaContorno: "#b6bccb", mapaBordes: "#d6dae4", mapaHalo: "#fff", puntoBorde: "#fff", puntoTexto: "#fff", grupoFondo: "#1a1d29", grupoTexto: "#fff" },
  oscuro: { bg: "#0e1016", surf: "#181b24", border: "#2a2e3b", acc: "#f0c040", accDim: "#d9a92e", green: "#3cc785", red: "#f06262", blue: "#6b9bff", evento: "#e0b43c", t1: "#eef0f6", t2: "#a9aec0", t3: "#767b8e",
    inp: "#0f1218", cabecera: "#12141b", linea: "#262a36", apagado: "#262a36", sombra: "0 2px 12px rgba(0,0,0,0.35)",
    mapaFondo: "#0b0d12", mapaTierra: "#242836", mapaContorno: "#4b5266", mapaBordes: "#353a49", mapaHalo: "#0b0d12", puntoBorde: "#0b0d12", puntoTexto: "#0e1016", grupoFondo: "#eef0f6", grupoTexto: "#0e1016" },
};
const C = { ...PALETAS.claro };
const card = { background: C.surf, border: `1px solid ${C.border}`, borderRadius: 16, boxShadow: C.sombra };
const TEMA_KEY = "tc_tema";
const TEMAS = [["auto", "Automático"], ["claro", "Claro"], ["oscuro", "Oscuro"]];
const leerTema = () => { const t = loadStorage(TEMA_KEY, "auto"); return TEMAS.some(([k]) => k === t) ? t : "auto"; };
const movilOscuro = () => { try { return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches); } catch { return false; } };
const temaReal = (pref, oscuroSistema) => (pref === "auto" ? (oscuroSistema ? "oscuro" : "claro") : pref);
const aplicarTema = (nombre) => {
  Object.assign(C, PALETAS[nombre] || PALETAS.claro);
  Object.assign(card, { background: C.surf, border: `1px solid ${C.border}`, boxShadow: C.sombra });
  try {
    document.documentElement.dataset.tema = nombre;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", C.bg);
  } catch {}
};
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
TRAZOS.resumen = TRAZOS.mensual;
TRAZOS.avion = <><path d="M10.200 13.800 3.400 11.600l1.500-1.500 6.500.900 4.300-4.300c1.200-1.200 3.400-1.700 4.300-.800s.400 3.100-.800 4.300l-4.300 4.300.900 6.500-1.500 1.500-2.200-6.800" /><path d="m10.200 13.800-2.700 2.700M7.500 16.500l-2.300-.400M7.500 16.500l.400 2.300" /></>;
TRAZOS.flota = <><circle cx="9" cy="8.2" r="3.2" /><path d="M2.8 19.6c.6-3.4 3-5.4 6.2-5.4s5.6 2 6.2 5.4" /><circle cx="17.2" cy="9.2" r="2.5" /><path d="M17 14.4c2.3.3 3.8 1.800 4.300 4.400" /></>;
TRAZOS.coche = <><path d="M4.4 16.4v-4.2l1.8-4.4a2 2 0 0 1 1.900-1.300h7.800a2 2 0 0 1 1.900 1.300l1.800 4.400v4.200" /><path d="M3.2 16.400h17.600" /><path d="M5.800 16.400v2.300M18.200 16.400v2.300" /><path d="M5 11.900h14" /><circle cx="7.700" cy="14.100" r="0.900" /><circle cx="16.300" cy="14.100" r="0.900" /></>;
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
              <circle cx={cx} cy={cy} r={r} fill="none" stroke={d ? `${c}26` : C.linea} strokeWidth={G} />
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
// puntos, con la Comunidad entera a la vista. Lo que cae junto (los recintos de
// la capital, casi siempre) se agrupa en un círculo con el número de sitios, y
// tocarlo deja esos sitios en la lista de debajo. Los puntos son HTML encima del
// dibujo para que el número y el tamaño no cambien con la escala.
const MapaEventos = ({ mapa, puntos, marcado, setMarcado }) => {
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
  const vb = { x: mapa.caja[0] - 10, y: mapa.caja[1] - 10, w: mapa.caja[2] + 20, h: mapa.caja[3] + 20 };
  const esc = ancho / vb.w;
  const aPx = ([x, y]) => [(x - vb.x) * esc, (y - vb.y) * esc];
  const alto = vb.h * esc;
  const marcas = puntos.map((p, i) => ({ ...p, n: i + 1, s: aPx(P(p.lat, p.lon)) }));
  const D = 24;
  const grupos = [];
  for (const m of marcas) { const g = grupos.find((g) => Math.hypot(g.s[0] - m.s[0], g.s[1] - m.s[1]) < D); if (g) g.miembros.push(m); else grupos.push({ s: [...m.s], miembros: [m] }); }
  const esMarcado = (lista) => !!marcado && marcado.length === lista.length && lista.every((l) => marcado.includes(l));
  // Nombres de municipios por orden de importancia (el del archivo): cada uno se
  // queda solo si no pisa a un punto ni a un nombre ya puesto, y el que se sale
  // por el borde se mete hacia dentro en vez de cortarse.
  const ocupado = grupos.map((g) => ({ x: g.s[0] - 16, y: g.s[1] - 16, w: 32, h: 32 }));
  const choca = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const etiquetas = [];
  for (const n of mapa.nombres) {
    if (n.en === "zona") continue;
    const [sx, sy] = aPx([n.x, n.y]); const w = n.n.length * 5.9 + 6, h = 14;
    const x = Math.min(Math.max(sx, w / 2 + 3), ancho - w / 2 - 3), y = Math.min(Math.max(sy, h / 2 + 3), alto - h / 2 - 3);
    const caja = { x: x - w / 2, y: y - h / 2, w, h };
    if (ocupado.some((o) => choca(o, caja))) continue;
    ocupado.push(caja); etiquetas.push({ ...n, s: [x, y] });
  }
  return (
    <div ref={ref} style={{ position: "relative", width: "100%", height: alto, borderRadius: 12, overflow: "hidden", background: C.mapaFondo }}>
      <svg viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} aria-hidden="true">
        <path d={mapa.tierra} fill={C.mapaTierra} stroke={C.mapaContorno} strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
        <path d={mapa.capital} fill={`${C.acc}24`} />
        <path d={mapa.bordes} fill="none" stroke={C.mapaBordes} strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
      </svg>
      {etiquetas.map((n) => (
        <span key={n.n} style={{ position: "absolute", left: n.s[0], top: n.s[1], transform: "translate(-50%,-50%)", fontSize: 10, fontWeight: 700, color: C.t3, whiteSpace: "nowrap", textShadow: `0 0 3px ${C.mapaHalo}, 0 0 3px ${C.mapaHalo}, 0 0 3px ${C.mapaHalo}`, pointerEvents: "none" }}>{n.n}</span>
      ))}
      {grupos.map((g) => {
        const lugares = g.miembros.map((m) => m.lugar); const on = esMarcado(lugares);
        if (g.miembros.length > 1) return (
          <button key={`g${g.miembros[0].n}`} className="nb" onClick={() => setMarcado(on ? null : lugares)} aria-label={`${g.miembros.length} sitios juntos: ${lugares.join(", ")}`} aria-pressed={on}
            style={{ position: "absolute", left: g.s[0], top: g.s[1], transform: `translate(-50%,-50%) scale(${on ? 1.15 : 1})`, minWidth: 32, height: 32, padding: "0 6px", borderRadius: 16, border: `2px solid ${on ? C.acc : C.puntoBorde}`, background: C.grupoFondo, color: C.grupoTexto, fontWeight: 900, fontSize: 12, fontFamily: "inherit", cursor: "pointer", boxShadow: "0 2px 6px rgba(30,34,54,0.3)", transition: "transform .15s" }}>{g.miembros.length}</button>
        );
        const m = g.miembros[0];
        return (
          <button key={`m${m.n}`} className="nb" onClick={() => setMarcado(on ? null : lugares)} aria-label={`${m.n}. ${m.lugar}`} aria-pressed={on}
            style={{ position: "absolute", left: g.s[0], top: g.s[1], transform: `translate(-50%,-50%) scale(${on ? 1.2 : 1})`, width: 26, height: 26, borderRadius: 13, border: `2px solid ${on ? C.t1 : C.puntoBorde}`, background: C.evento, color: C.puntoTexto, fontWeight: 900, fontSize: 12, fontFamily: "inherit", cursor: "pointer", boxShadow: "0 2px 6px rgba(30,34,54,0.3)", transition: "transform .15s", padding: 0 }}>{m.n}</button>
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
// Qué parte de lo facturado viene de cada sitio, y cómo va frente al periodo
// anterior del mismo tamaño (el mes pasado, la semana pasada…).
const mesAnterior = (ym) => { const [y, m] = ym.split("-").map(Number); return ymd(new Date(y, m - 2, 1)).slice(0, 7); };
const diasEntre = (a, b) => { const [y1, m1, d1] = a.split("-").map(Number); const [y2, m2, d2] = b.split("-").map(Number); return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000); };
const Reparto = ({ entries, plats, previo, frente }) => {
  const d = desgloseDe(entries, plats);
  const filas = d.filas.filter((f) => f.fact > 0).sort((a, b) => b.fact - a.fact);
  if (!filas.length) return null;
  const cambio = previo > 0 ? ((d.totalFact - previo) / previo) * 100 : null;
  const sube = cambio !== null && cambio >= 0;
  return (
    <div style={{ ...card, padding: 16, marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: C.t2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Por plataforma</div>
        {cambio !== null && <div style={{ fontSize: 12, fontWeight: 800, color: sube ? C.green : C.red, textAlign: "right" }}>{sube ? "▲" : "▼"} {Math.abs(cambio).toLocaleString("es-ES", { maximumFractionDigits: 0 })} % <span style={{ color: C.t3, fontWeight: 600 }}>frente a {frente}</span></div>}
      </div>
      {filas.map((f) => { const parte = d.totalFact ? f.fact / d.totalFact : 0; return (
        <div key={f.nombre} style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13, marginBottom: 4 }}>
            <span style={{ fontWeight: 700, color: C.t1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.nombre}</span>
            <span style={{ color: C.t2, whiteSpace: "nowrap" }}><strong style={{ color: C.t1 }}>{fmt(f.fact)}</strong> · {Math.round(parte * 100)} %</span>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: C.linea, overflow: "hidden" }}><div style={{ width: `${Math.max(2, parte * 100)}%`, height: "100%", borderRadius: 4, background: C.acc }} /></div>
        </div>
      ); })}
    </div>
  );
};
const Desglose = ({ entries, plats, etiqueta, boton = "Copiar para la empresa" }) => {
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
        <div key={f.nombre} style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 0", borderTop: `1px solid ${C.linea}` }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: C.t1, wordBreak: "break-word" }}>{f.nombre}</span>
          <span style={{ ...col, fontSize: 13.5, fontWeight: 700, color: C.t1 }}>{fmt(f.fact)}</span>
          <span style={{ ...col, fontSize: 13.5, fontWeight: 700, color: C.t1 }}>{fmt(f.efec)}</span>
        </div>
      ))}
      {d.tarjeta > 0 && <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 0", borderTop: `1px solid ${C.linea}` }}>
        <span style={{ flex: 1, fontSize: 13, color: C.t2 }}>Tarjeta</span>
        <span style={{ ...col, fontSize: 13.5, fontWeight: 600, color: C.t2 }}>{fmt(d.tarjeta)}</span>
        <span style={col} />
      </div>}
      <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 0 2px", borderTop: `2px solid ${C.border}` }}>
        <span style={{ flex: 1, fontSize: 13.5, fontWeight: 900, color: C.t1 }}>Total</span>
        <span style={{ ...col, fontSize: 14.5, fontWeight: 900, color: C.accDim }}>{fmt(d.totalFact)}</span>
        <span style={{ ...col, fontSize: 14.5, fontWeight: 900, color: C.blue }}>{fmt(d.totalEfec)}</span>
      </div>
      <div style={{ fontSize: 11, color: C.t3, marginTop: 8, lineHeight: 1.45 }}>Efectivo del taxímetro: el taxímetro menos lo cobrado con tarjeta.</div>
      <button className="nb" onClick={copiar} style={{ marginTop: 10, width: "100%", padding: 10, borderRadius: 10, border: `1px solid ${C.acc}66`, background: `${C.acc}14`, color: C.accDim, fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>{aviso || boton}</button>
    </div>
  );
};

// EL INFORME EN PDF: para mandárselo a la empresa o al gestor por WhatsApp.
// Se pinta cada página en un lienzo (con la letra de la app, y así no hay que
// meter ninguna librería ni tipografías en el PDF) y el PDF lleva una imagen
// por página. Siempre en claro: es para imprimir o leer en cualquier móvil.
const pintarInforme = (inf, escala = 2) => {
  const P = PALETAS.claro; const W = 595, H = 842, M = 42, DER = W - M;
  const lienzos = []; let ctx, y;
  const letra = (peso, t) => `${peso} ${t}px "DM Sans", system-ui, sans-serif`;
  const txt = (s, x, yy, { t = 10.5, peso = 400, color = P.t1, al = "left" } = {}) => { ctx.font = letra(peso, t); ctx.fillStyle = color; ctx.textAlign = al; ctx.fillText(String(s), x, yy); };
  const raya = (yy, color = P.border, grosor = 1) => { ctx.fillStyle = color; ctx.fillRect(M, yy, W - 2 * M, grosor); };
  const caja = (x, yy, w, h, r, fondo, borde) => {
    ctx.beginPath(); ctx.moveTo(x + r, yy); ctx.arcTo(x + w, yy, x + w, yy + h, r); ctx.arcTo(x + w, yy + h, x, yy + h, r); ctx.arcTo(x, yy + h, x, yy, r); ctx.arcTo(x, yy, x + w, yy, r); ctx.closePath();
    if (fondo) { ctx.fillStyle = fondo; ctx.fill(); }
    if (borde) { ctx.strokeStyle = borde; ctx.lineWidth = 1; ctx.stroke(); }
  };
  const nueva = () => {
    const cv = document.createElement("canvas"); cv.width = W * escala; cv.height = H * escala;
    ctx = cv.getContext("2d"); ctx.scale(escala, escala); ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H); ctx.textBaseline = "alphabetic";
    lienzos.push({ cv, ctx });
    txt("TX", M, 56, { t: 22, peso: 900 }); ctx.font = letra(900, 22); const ancho = ctx.measureText("TX").width; txt("pro", M + ancho, 56, { t: 22, peso: 900, color: P.accDim });
    txt(inf.titulo, DER, 48, { t: 13, peso: 800, al: "right" }); txt(inf.sub, DER, 62, { t: 9, color: P.t3, al: "right" });
    raya(72, P.acc, 2); y = 100;
  };
  const hueco = (alto) => { if (y + alto > H - 56) nueva(); };
  const titulo = (s) => { hueco(60); txt(s.toUpperCase(), M, y, { t: 8.5, peso: 800, color: P.t3 }); y += 7; raya(y, P.t3); y += 17; };
  const fila = (label, val, o = {}) => {
    hueco(24); txt(label, M, y, { t: 10.5, peso: o.fuerte ? 800 : 400, color: o.fuerte ? P.t1 : P.t2 });
    txt(val, DER, y, { t: o.fuerte ? 11.5 : 10.5, peso: o.fuerte ? 900 : 700, color: o.color || P.t1, al: "right" }); y += 8; raya(y); y += 16;
  };
  nueva();
  // Lo facturado y la cuenta de lo que queda.
  txt(inf.total, M, y + 20, { t: 30, peso: 900, color: P.accDim }); txt(inf.totalSub, M, y + 38, { t: 10.5, color: P.t2 }); y += 54;
  const an = (W - 2 * M - 16) / 3;
  inf.fichas.forEach((f, i) => {
    const x = M + i * (an + 8); const col = f.color === "verde" ? P.green : f.color === "rojo" ? P.red : P.t1;
    caja(x, y, an, 46, 8, f.destacada ? `${col}14` : "#ffffff", f.destacada ? `${col}66` : P.border);
    txt(f.label.toUpperCase(), x + an / 2, y + 17, { t: 8, peso: 800, color: f.destacada ? col : P.t3, al: "center" });
    txt(f.val, x + an / 2, y + 35, { t: 13.5, peso: 900, color: col, al: "center" });
  });
  y += 58;
  if (inf.nota) { txt(inf.nota, M, y, { t: 8.5, color: P.t3 }); y += 14; }
  if (inf.balance) {
    const col = inf.balance.color === "verde" ? P.green : inf.balance.color === "oro" ? P.accDim : P.red;
    caja(M, y, W - 2 * M, 40, 8, `${col}12`, `${col}55`);
    txt(inf.balance.label.toUpperCase(), M + 14, y + (inf.balance.sub ? 18 : 25), { t: 9.5, peso: 800, color: P.t2 });
    if (inf.balance.sub) txt(inf.balance.sub, M + 14, y + 31, { t: 8.5, color: P.t3 });
    txt(inf.balance.val, DER - 14, y + 27, { t: 17, peso: 900, color: col, al: "right" }); y += 62;
  } else y += 8;
  // Desglose: cuánto de cada cosa y cuánto de ello en efectivo.
  const C2 = DER - 120;
  titulo("Desglose");
  y -= 4; txt("FACTURADO", C2, y, { t: 8, peso: 800, color: P.t3, al: "right" }); txt("EFECTIVO", DER, y, { t: 8, peso: 800, color: P.blue, al: "right" }); y += 16;
  for (const f of inf.desglose.filas) { txt(f.nombre, M, y, { t: 10.5, peso: 700 }); txt(f.fact, C2, y, { t: 10.5, peso: 700, al: "right" }); txt(f.efec, DER, y, { t: 10.5, peso: 700, al: "right" }); y += 8; raya(y); y += 16; }
  if (inf.desglose.tarjeta) { txt("Tarjeta", M, y, { color: P.t2 }); txt(inf.desglose.tarjeta, C2, y, { peso: 700, color: P.t2, al: "right" }); y += 8; raya(y); y += 16; }
  txt("Total", M, y + 2, { t: 11.5, peso: 900 }); txt(inf.desglose.totalFact, C2, y + 2, { t: 11.5, peso: 900, color: P.accDim, al: "right" }); txt(inf.desglose.totalEfec, DER, y + 2, { t: 11.5, peso: 900, color: P.blue, al: "right" }); y += 34;
  titulo(inf.liquidacionTitulo);
  for (const f of inf.liquidacion) fila(f.label, f.val, { fuerte: f.fuerte, color: f.color === "rojo" ? P.red : f.color === "verde" ? P.green : f.color === "azul" ? P.blue : f.color === "oro" ? P.accDim : undefined });
  if (inf.jornada.length) { y += 10; titulo("Jornada"); for (const f of inf.jornada) fila(f.label, f.val, { fuerte: f.fuerte }); }
  if (inf.gastos.length) { y += 10; titulo("Gastos"); for (const g of inf.gastos) fila(g.label, g.val, { color: P.red }); }
  // Día a día, con la cabecera repetida en cada página.
  if (inf.dias.filas.length) {
    const cols = inf.dias.cols; const ancho = (W - 2 * M - 62) / (cols.length - 1);
    const xDe = (i) => (i === 0 ? M : M + 62 + ancho * i);
    const cabecera = () => { cols.forEach((c, i) => txt(c.toUpperCase(), xDe(i), y, { t: 8, peso: 800, color: P.t3, al: i === 0 ? "left" : "right" })); y += 7; raya(y, P.t3); y += 15; };
    y += 10; hueco(Math.min(inf.dias.filas.length, 10) * 19 + 50); txt("DÍA A DÍA", M, y, { t: 8.5, peso: 800, color: P.t3 }); y += 18; cabecera();
    for (const f of inf.dias.filas) {
      if (y + 20 > H - 56) { nueva(); cabecera(); }
      f.forEach((v, i) => { const celda = typeof v === "object" ? v : { v }; txt(celda.v, xDe(i), y, { t: 9.5, peso: i === 0 ? 400 : 700, color: celda.color === "verde" ? P.green : celda.color === "rojo" ? P.red : i === 0 ? P.t2 : P.t1, al: i === 0 ? "left" : "right" }); });
      y += 6; raya(y, P.linea); y += 13;
    }
  }
  lienzos.forEach(({ ctx: c }, i) => { ctx = c; raya(H - 40); txt("Generado con TXpro · txpro.app", M, H - 26, { t: 8.5, color: P.t3 }); txt(`Página ${i + 1} de ${lienzos.length}`, DER, H - 26, { t: 8.5, color: P.t3, al: "right" }); });
  return lienzos.map((l) => l.cv);
};
// Un PDF mínimo: una página A4 por imagen JPEG, a página completa.
const pdfDeJpegs = (imagenes) => {
  const cod = new TextEncoder(); const partes = []; const pos = []; let largo = 0;
  const pon = (x) => { const u = typeof x === "string" ? cod.encode(x) : x; partes.push(u); largo += u.length; };
  const obj = (n, cuerpo, flujo) => { pos[n] = largo; pon(`${n} 0 obj\n${cuerpo}\n`); if (flujo) { pon("stream\n"); pon(flujo); pon("\nendstream\n"); } pon("endobj\n"); };
  const W = 595.28, H = 841.89, n = imagenes.length;
  pon("%PDF-1.4\n"); pon(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, `<< /Type /Pages /Kids [${imagenes.map((_, i) => `${3 + i * 3} 0 R`).join(" ")}] /Count ${n} >>`);
  imagenes.forEach((im, i) => {
    const pag = 3 + i * 3, cont = pag + 1, img = pag + 2; const dibujo = cod.encode(`q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`);
    obj(pag, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 ${img} 0 R >> >> /Contents ${cont} 0 R >>`);
    obj(cont, `<< /Length ${dibujo.length} >>`, dibujo);
    obj(img, `<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.bytes.length} >>`, im.bytes);
  });
  const total = 2 + n * 3; const tabla = largo;
  pon(`xref\n0 ${total + 1}\n0000000000 65535 f \n`);
  for (let k = 1; k <= total; k++) pon(`${String(pos[k]).padStart(10, "0")} 00000 n \n`);
  pon(`trailer\n<< /Size ${total + 1} /Root 1 0 R >>\nstartxref\n${tabla}\n%%EOF\n`);
  return new Blob(partes, { type: "application/pdf" });
};
const crearInformePDF = async (inf) => {
  try { await Promise.all([400, 700, 800, 900].map((p) => document.fonts.load(`${p} 12px "DM Sans"`))); } catch {}
  const lienzos = pintarInforme(inf);
  const imagenes = await Promise.all(lienzos.map((cv) => new Promise((ok, mal) => cv.toBlob((b) => (b ? b.arrayBuffer().then((buf) => ok({ bytes: new Uint8Array(buf), w: cv.width, h: cv.height })) : mal(new Error("sin imagen"))), "image/jpeg", 0.92))));
  return pdfDeJpegs(imagenes);
};
// Lo comparte con la hoja del móvil (WhatsApp, correo…) y, donde no se puede
// compartir un archivo, lo descarga.
const entregarArchivo = async (blob, nombre, titulo) => {
  const archivo = new File([blob], nombre, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
    try { await navigator.share({ files: [archivo], title: titulo }); return "compartido"; } catch (e) { if (e && e.name === "AbortError") return "cancelado"; }
  }
  const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 15000);
  return "descargado";
};
// LO PRIMERO DEL RESUMEN: lo facturado y, debajo, la cuenta que importa: tu
// parte, lo que has gastado tú y lo que te queda limpio (con propinas y extras).
const Hero = ({ total, dias, media, parte, etiqueta, propinas = 0, extra = 0, gastos = 0 }) => {
  const limpio = parte + propinas + extra - gastos;
  const corto = (v) => (Math.abs(v) >= 10000 ? fmt0(v) : fmt(v));
  const ficha = { flex: 1, minWidth: 0, background: C.surf, border: `1px solid ${C.border}`, borderRadius: 12, padding: "9px 6px", textAlign: "center" };
  const tit = { fontSize: 10.5, color: C.t3, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
  const val = { fontSize: 13.5, fontWeight: 900, whiteSpace: "nowrap" };
  const colLimpio = limpio >= 0 ? C.green : C.red;
  const suma = [propinas > 0 ? `${fmt(propinas)} de propinas` : null, extra > 0 ? `${fmt(extra)} de extra` : null].filter(Boolean);
  return (
    <div style={{ background: `${C.acc}10`, border: `1px solid ${C.acc}30`, borderRadius: 18, padding: 18, marginBottom: 12, boxShadow: `0 4px 18px ${C.acc}14` }} aria-label="Resumen del periodo">
      <div style={{ fontSize: 32, fontWeight: 900, color: C.accDim }}>{fmt(total)}</div>
      <div style={{ fontSize: 13, color: C.t2, marginTop: 4 }}>Facturado{dias > 0 ? <> · {dias} {dias === 1 ? "día" : "días"} · media <strong style={{ color: C.t1 }}>{fmt0(media)}</strong> al día</> : null}</div>
      <div style={{ display: "flex", gap: 7, marginTop: 12 }}>
        <div style={ficha}><div style={tit}>{etiqueta}</div><div style={{ ...val, color: parte >= 0 ? C.t1 : C.red }}>{corto(parte)}</div></div>
        <div style={ficha}><div style={tit}>Tus gastos</div><div style={{ ...val, color: gastos > 0 ? C.red : C.t3 }}>{gastos > 0 ? "−" : ""}{corto(gastos)}</div></div>
        <div style={{ ...ficha, background: `${colLimpio}12`, border: `1px solid ${colLimpio}44` }}><div style={{ ...tit, color: colLimpio }}>Te queda</div><div style={{ ...val, color: colLimpio }}>{corto(limpio)}</div></div>
      </div>
      {suma.length > 0 && <div style={{ fontSize: 11, color: C.t3, marginTop: 8 }}>«Te queda» incluye {suma.join(" y ")}.</div>}
    </div>
  );
};
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
const JornadaResumen = ({ j, nota }) => {
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
      {j.min > 0 && <div style={{ fontSize: 11, color: C.t3, marginTop: 8, lineHeight: 1.45 }}>Por hora: {nota} más las propinas, entre las horas de los días en que apuntaste la jornada.</div>}
    </div>
  );
};
// pendiente: mes en curso con cuota mensual. Mientras la empresa no ha cobrado
// la cuota no se dice "debes", sino lo que falta para cubrirla.
const Balance = ({ value, sub, pendiente }) => { const neg = value <= 0; const falta = pendiente && !neg; const col = neg ? C.green : falta ? C.accDim : C.red; return (
  <div style={{ background: neg ? `${C.green}14` : falta ? `${C.acc}14` : `${C.red}14`, border: `1.5px solid ${neg ? C.green : falta ? C.acc : C.red}44`, borderRadius: 16, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
    <div><div style={{ fontSize: 12, color: C.t2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}><><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: col, marginRight: 7, verticalAlign: "middle" }} />{neg ? (pendiente ? "Cuota cubierta · la empresa te debe" : "Empresa debe al conductor") : falta ? "Faltan para cubrir la cuota del mes" : "Conductor debe a empresa"}</></div><div style={{ fontSize: 11, color: C.t3, marginTop: 3 }}>{sub}</div></div>
    <div style={{ fontSize: 24, fontWeight: 900, color: col, marginLeft: 14 }}>{falta ? "" : neg ? "−" : "+"}{fmt(Math.abs(value))}</div>
  </div>
); };
// Con cuota mensual no hay saldo por día (la cuota se resta en el mes): la tabla
// enseña lo que cobró la empresa cada día en lugar de "tu parte" y la diferencia.
const DayTable = ({ rows, etiqueta, mensual, empresa }) => (
  <div style={{ ...card, padding: 16, marginBottom: 20, overflowX: "auto" }}>
    <div style={{ fontSize: 11, color: C.t2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Día a día</div>
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
      <thead><tr>{["Fecha", "Fact.", "Acum.", ...(mensual ? ["Cobró empresa"] : [etiqueta, "Diferencia"])].map((h, i) => (<th key={h} style={{ padding: "6px 6px", color: C.t2, fontWeight: 700, textAlign: i === 0 ? "left" : "right", borderBottom: `1px solid ${C.border}`, fontSize: 11, whiteSpace: "nowrap" }}>{h}</th>))}</tr></thead>
      <tbody>{rows.map(({ date, s: ds, acumFact }) => { const neg = ds.diferencia <= 0; return (<tr key={date}><td style={{ padding: "8px 6px", color: C.t2, fontSize: 12, borderBottom: `1px solid ${C.border}22` }}>{dayMonth(date)}</td><td style={{ padding: "8px 6px", textAlign: "right", borderBottom: `1px solid ${C.border}22`, fontSize: 12 }}>{fmt(ds.facturacion)}</td><td style={{ padding: "8px 6px", textAlign: "right", borderBottom: `1px solid ${C.border}22`, fontSize: 12 }}>{fmt(acumFact)}</td>{mensual ? <td style={{ padding: "8px 6px", textAlign: "right", borderBottom: `1px solid ${C.border}22`, fontSize: 12 }}>{fmt(ds.cobradoEmpresa)}</td> : <><td style={{ padding: "8px 6px", textAlign: "right", borderBottom: `1px solid ${C.border}22`, color: C.accDim, fontWeight: 700, fontSize: 12 }}>{fmt(ds.conductor50)}</td><td style={{ padding: "8px 6px", textAlign: "right", borderBottom: `1px solid ${C.border}22`, color: neg !== !!empresa ? C.green : C.red, fontWeight: 800, fontSize: 12, whiteSpace: "nowrap" }}>{neg ? "−" : "+"}{fmt(Math.abs(ds.diferencia))}</td></>}</tr>); })}</tbody>
    </table>
    <div style={{ fontSize: 11, color: C.t3, marginTop: 10 }}>{mensual ? "La cuota mensual se resta en el balance del mes, no día a día." : empresa ? "Verde (+) = te debe el conductor · Rojo (−) = le debes" : "Verde (−) = empresa debe · Rojo (+) = conductor debe"}</div>
  </div>
);
// ═══════════════════════════════════════════════════════════════════════════
// GASOLINERAS BARATAS
// Los precios son los oficiales que las estaciones comunican al Ministerio
// (Geoportal de Gasolineras). El servicio es público y se puede leer desde el
// navegador, así que no hace falta clave ni servidor propio. La app baja la
// lista entera de la Comunidad de Madrid para un combustible y busca aquí
// dentro: la ubicación del conductor no sale del móvil.
// ═══════════════════════════════════════════════════════════════════════════
const GAS_URL = "https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/FiltroProvinciaProducto/28/";
const GAS_KEY = "tc_gas";             // lo que eligió: combustible, distancia, orden
const GAS_DATOS_KEY = "tc_gas_datos"; // la última lista, para abrir sin cobertura
const GAS_CADUCA = 30 * 60 * 1000;    // el Ministerio renueva cada media hora
const COMBUSTIBLES = [["1", "Gasolina 95"], ["4", "Diésel"], ["17", "GLP"], ["18", "GNC"]];
const GAS_RADIOS = [2, 5, 10, 20];
const GAS_PREF = { comb: "1", radio: 5, orden: "precio", solo24: false };
const leerGasPref = () => {
  const p = loadStorage(GAS_KEY, null) || {};
  return {
    comb: COMBUSTIBLES.some(([id]) => id === p.comb) ? p.comb : GAS_PREF.comb,
    radio: GAS_RADIOS.includes(p.radio) ? p.radio : GAS_PREF.radio,
    orden: p.orden === "cerca" ? "cerca" : "precio",
    solo24: p.solo24 === true,
  };
};
const numEs = (s) => { const n = parseFloat(String(s == null ? "" : s).replace(",", ".")); return Number.isFinite(n) ? n : NaN; };
const textoCorto = (s, max) => String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, max);
// Las direcciones llegan EN MAYÚSCULAS: se dejan como se escriben.
const enMinusculas = (s) => s.toLowerCase().replace(/(^|[\s.\-/(,])([a-záéíóúüñ])/g, (m, a, b) => a + b.toUpperCase());
const sinAcentos = (s) => String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
// Solo entra lo que tiene precio y sitio creíbles; lo demás se descarta.
const limpiarEstaciones = (lista) => {
  if (!Array.isArray(lista)) return [];
  const out = [];
  for (const e of lista) {
    if (!e || typeof e !== "object") continue;
    const precio = numEs(e.PrecioProducto), lat = numEs(e.Latitud), lon = numEs(e["Longitud (WGS84)"]);
    if (!(precio > 0.2 && precio < 6) || !(lat > 35 && lat < 44.5) || !(lon > -10 && lon < 5)) continue;
    const horario = textoCorto(e.Horario, 80);
    out.push({ id: textoCorto(e.IDEESS, 12), rotulo: textoCorto(e["Rótulo"], 40) || "Gasolinera", dir: enMinusculas(textoCorto(e["Dirección"], 70)).replace(/[\s,;.\-]+$/, ""), muni: textoCorto(e.Municipio, 40), lat, lon, precio, horario, h24: /^L-D:\s*24\s*H$/i.test(horario) });
  }
  return out;
};
const leerGasDatos = () => {
  const d = loadStorage(GAS_DATOS_KEY, null);
  if (!d || typeof d !== "object" || !COMBUSTIBLES.some(([id]) => id === d.comb) || !Number.isFinite(d.hora) || !Array.isArray(d.estaciones)) return null;
  const estaciones = d.estaciones.filter((e) => e && Number.isFinite(e.precio) && Number.isFinite(e.lat) && Number.isFinite(e.lon) && typeof e.rotulo === "string");
  return estaciones.length ? { comb: d.comb, hora: d.hora, estaciones } : null;
};
const descargarGasolineras = async (comb) => {
  const corte = typeof AbortController === "function" ? new AbortController() : null;
  const reloj = corte ? setTimeout(() => corte.abort(), 25000) : null;
  try {
    const res = await fetch(GAS_URL + comb, { headers: { Accept: "application/json" }, cache: "no-store", ...(corte ? { signal: corte.signal } : {}) });
    if (!res.ok) throw new Error("sin respuesta");
    const crudo = await res.json();
    const estaciones = limpiarEstaciones(crudo && crudo.ListaEESSPrecio);
    if (!estaciones.length) throw new Error("lista vacía");
    return { comb, hora: Date.now(), estaciones };
  } finally { if (reloj) clearTimeout(reloj); }
};
const distanciaKm = (a, b) => {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};
const precioLitro = (n) => n.toLocaleString("es-ES", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const kmTxt = (km) => (km < 1 ? `${Math.round(km * 100) * 10} m` : `${km.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`);
const comoLlegar = (e) => `https://www.google.com/maps/dir/?api=1&destination=${e.lat},${e.lon}`;

function Gasolineras({ alVolver }) {
  const [pref, setPref] = useState(leerGasPref);
  const [datos, setDatos] = useState(null);
  const [estado, setEstado] = useState("cargando");
  const [recarga, setRecarga] = useState(0);
  const forzar = useRef(false);
  const [pos, setPos] = useState(null);
  const [posEstado, setPosEstado] = useState("");
  const [busca, setBusca] = useState("");
  const [cuantas, setCuantas] = useState(12);
  const cambiar = (k, v) => { const n = { ...pref, [k]: v }; setPref(n); setCuantas(12); try { localStorage.setItem(GAS_KEY, JSON.stringify(n)); } catch {} };

  useEffect(() => {
    let vivo = true;
    const g = leerGasDatos();
    const guardado = g && g.comb === pref.comb ? g : null;
    setDatos(guardado);
    if (guardado && !forzar.current && Date.now() - guardado.hora < GAS_CADUCA) { setEstado(""); return undefined; }
    forzar.current = false;
    setEstado("cargando");
    descargarGasolineras(pref.comb)
      .then((d) => { if (!vivo) return; setDatos(d); setEstado(""); try { localStorage.setItem(GAS_DATOS_KEY, JSON.stringify(d)); } catch {} })
      .catch(() => { if (vivo) setEstado("error"); });
    return () => { vivo = false; };
  }, [pref.comb, recarga]);

  const ubicar = () => {
    if (!navigator.geolocation) { setPosEstado("fallo"); return; }
    setPosEstado("buscando");
    navigator.geolocation.getCurrentPosition(
      (p) => { setPos({ lat: p.coords.latitude, lon: p.coords.longitude }); setPosEstado(""); setCuantas(12); },
      (e) => setPosEstado(e && e.code === 1 ? "denegada" : "fallo"),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 120000 }
    );
  };
  // Si ya dio permiso otro día, no hace falta que vuelva a pulsar.
  useEffect(() => { try { navigator.permissions.query({ name: "geolocation" }).then((r) => { if (r.state === "granted") ubicar(); }).catch(() => {}); } catch {} }, []);

  const q = sinAcentos(busca.trim());
  const vista = useMemo(() => {
    if (!datos) return { filas: [], media: 0, mejor: null };
    let l = datos.estaciones.map((e) => ({ ...e, km: pos ? distanciaKm(pos, e) : null }));
    if (pref.solo24) l = l.filter((e) => e.h24);
    if (q) l = l.filter((e) => sinAcentos(`${e.rotulo} ${e.dir} ${e.muni}`).includes(q));
    else if (pos) l = l.filter((e) => e.km <= pref.radio);
    const media = l.length ? l.reduce((s, e) => s + e.precio, 0) / l.length : 0;
    const porPrecio = (a, b) => a.precio - b.precio || (a.km || 0) - (b.km || 0);
    const mejor = l.length ? [...l].sort(porPrecio)[0] : null;
    l.sort(pref.orden === "cerca" && pos ? (a, b) => a.km - b.km || a.precio - b.precio : porPrecio);
    return { filas: l, media, mejor };
  }, [datos, pos, pref.solo24, pref.radio, pref.orden, q]);

  const nombreComb = (COMBUSTIBLES.find(([id]) => id === pref.comb) || COMBUSTIBLES[0])[1];
  const unidad = pref.comb === "18" ? "€/kg" : "€/l";
  const carga = pref.comb === "18" ? [15, "15 kg"] : [40, "40 litros"];
  const hora = datos ? new Date(datos.hora) : null;
  const horaTxt = hora ? `${hora.toLocaleDateString("es-ES", { day: "numeric", month: "long" })} a las ${hora.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}` : "";
  const viejo = datos && Date.now() - datos.hora > 6 * 3600 * 1000;
  const { filas, media, mejor } = vista;
  const ahorro = mejor ? (media - mejor.precio) * carga[0] : 0;
  const donde = q ? `con «${busca.trim()}»` : pos ? `a menos de ${pref.radio} km` : "de la Comunidad de Madrid";
  const chip = (on) => ({ padding: "8px 12px", borderRadius: 999, border: `1px solid ${on ? C.acc : C.border}`, background: on ? `${C.acc}22` : C.surf, color: on ? C.accDim : C.t2, fontWeight: on ? 800 : 600, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" });
  const etiqueta = { fontSize: 11, color: C.t2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 };

  return (<>
    <button className="nb" onClick={alVolver} style={{ background: "none", border: "none", padding: "2px 0", marginBottom: 8, color: C.accDim, fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>‹ Gastos</button>
    <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 4 }}>Gasolineras baratas</div>
    <div style={{ fontSize: 12, color: C.t2, marginBottom: 12 }}>Precios oficiales de hoy en la Comunidad de Madrid.</div>

    <div role="group" aria-label="Combustible" style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2, marginBottom: 10 }}>
      {COMBUSTIBLES.map(([id, nombre]) => <button key={id} className="nb" aria-pressed={pref.comb === id} onClick={() => cambiar("comb", id)} style={chip(pref.comb === id)}>{nombre}</button>)}
    </div>

    {!pos && <div style={{ ...card, padding: 14, marginBottom: 10 }} aria-label="Tu ubicación">
      <div style={{ fontSize: 13, color: C.t1, fontWeight: 700, marginBottom: 4 }}>¿Cerca de dónde estás?</div>
      <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.5, marginBottom: 10 }}>Con tu ubicación te enseño las de alrededor y a cuánto te quedan. La ubicación no sale del móvil ni se guarda.</div>
      <button className="nb" onClick={ubicar} disabled={posEstado === "buscando"} style={{ width: "100%", padding: 11, borderRadius: 12, border: "none", background: C.acc, color: "#1a1d29", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit", opacity: posEstado === "buscando" ? 0.6 : 1 }}>{posEstado === "buscando" ? "Buscando dónde estás…" : "Usar mi ubicación"}</button>
      {posEstado === "denegada" && <div role="status" style={{ fontSize: 12, color: C.red, marginTop: 8, lineHeight: 1.5 }}>El móvil no ha dado permiso de ubicación. Puedes darlo en los ajustes del teléfono, o buscar abajo por municipio o calle.</div>}
      {posEstado === "fallo" && <div role="status" style={{ fontSize: 12, color: C.red, marginTop: 8, lineHeight: 1.5 }}>No he podido saber dónde estás. Prueba otra vez o busca abajo por municipio o calle.</div>}
    </div>}

    {pos && <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2, marginBottom: 8 }} role="group" aria-label="Distancia">
      {GAS_RADIOS.map((r) => <button key={r} className="nb" aria-pressed={pref.radio === r} onClick={() => cambiar("radio", r)} style={chip(pref.radio === r)}>{r} km</button>)}
    </div>}
    <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2, marginBottom: 10 }} role="group" aria-label="Orden">
      {pos && <button className="nb" aria-pressed={pref.orden === "precio"} onClick={() => cambiar("orden", "precio")} style={chip(pref.orden === "precio")}>Más baratas</button>}
      {pos && <button className="nb" aria-pressed={pref.orden === "cerca"} onClick={() => cambiar("orden", "cerca")} style={chip(pref.orden === "cerca")}>Más cerca</button>}
      <button className="nb" aria-pressed={pref.solo24} onClick={() => cambiar("solo24", !pref.solo24)} style={chip(pref.solo24)}>Abiertas 24 h</button>
    </div>
    <input type="search" aria-label="Buscar gasolinera" value={busca} onChange={(e) => { setBusca(e.target.value); setCuantas(12); }} placeholder="Busca un municipio, calle o marca" style={{ width: "100%", boxSizing: "border-box", padding: "11px 12px", borderRadius: 12, border: `1px solid ${C.border}`, background: C.inp, color: C.t1, fontSize: 14, fontFamily: "inherit", marginBottom: 12 }} />

    {estado === "cargando" && !datos && <div role="status" style={{ ...card, padding: 18, textAlign: "center", color: C.t2, fontSize: 13 }}>Bajando los precios de hoy…</div>}
    {estado === "error" && <div role="alert" style={{ background: `${C.red}12`, border: `1px solid ${C.red}44`, borderRadius: 12, padding: 12, marginBottom: 12, fontSize: 12.5, color: C.t1, lineHeight: 1.5 }}>
      {datos ? "No he podido actualizar los precios (¿sin cobertura?). Te enseño los últimos que bajé." : "No he podido bajar los precios. Comprueba la conexión y vuelve a probar."}
      <button className="nb" onClick={() => { forzar.current = true; setRecarga((n) => n + 1); }} style={{ display: "block", marginTop: 8, padding: "7px 12px", borderRadius: 10, border: `1px solid ${C.border}`, background: C.surf, color: C.t1, fontWeight: 700, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>Reintentar</button>
    </div>}

    {datos && mejor && <div style={{ ...card, padding: 16, marginBottom: 12, borderColor: `${C.green}55` }} aria-label="La más barata">
      <div style={etiqueta}>La más barata {donde}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 6 }}>
        <span style={{ fontSize: 34, fontWeight: 900, color: C.green, letterSpacing: -0.5 }}>{precioLitro(mejor.precio)}</span>
        <span style={{ fontSize: 14, fontWeight: 800, color: C.t2 }}>{unidad}</span>
      </div>
      <div style={{ fontSize: 15, fontWeight: 900, marginTop: 4 }}>{mejor.rotulo}</div>
      <div style={{ fontSize: 12.5, color: C.t2, marginTop: 2, lineHeight: 1.45 }}>{mejor.dir}{mejor.muni ? ` · ${mejor.muni}` : ""}{mejor.km != null ? ` · a ${kmTxt(mejor.km)}` : ""}</div>
      {filas.length > 1 && <div style={{ fontSize: 12.5, color: C.t1, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.linea}`, lineHeight: 1.5 }}>La media de las {filas.length} gasolineras {donde} es <strong>{precioLitro(media)} {unidad}</strong>.{ahorro >= 0.5 ? <> Echando {carga[1]} aquí te ahorras <strong style={{ color: C.green }}>{fmt(ahorro)}</strong>.</> : null}</div>}
      <a href={comoLlegar(mejor)} target="_blank" rel="noopener noreferrer" style={{ display: "block", marginTop: 12, padding: 11, borderRadius: 12, background: C.acc, color: "#1a1d29", fontWeight: 800, fontSize: 14, textAlign: "center", textDecoration: "none" }}>Cómo llegar</a>
    </div>}

    {datos && !mejor && <div role="status" style={{ ...card, padding: 16, marginBottom: 12, fontSize: 13, color: C.t2, lineHeight: 1.5 }} aria-label="Sin resultados">No hay gasolineras con {nombreComb}{pref.solo24 ? " abiertas 24 h" : ""} {donde}.{pos && !q && pref.radio < 20 ? " Prueba con más distancia." : ""}</div>}

    {datos && filas.length > 0 && <div style={{ ...card, padding: "4px 14px", marginBottom: 12 }} aria-label="Lista de gasolineras">
      {filas.slice(0, cuantas).map((e, i) => { const dif = e.precio - media; return (
        <a key={e.id || i} href={comoLlegar(e)} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 0", borderTop: i ? `1px solid ${C.linea}` : "none", textDecoration: "none", color: C.t1 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.rotulo}</div>
            <div style={{ fontSize: 12, color: C.t2, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.dir}{e.muni ? ` · ${e.muni}` : ""}</div>
            <div style={{ fontSize: 11.5, color: C.t3, marginTop: 2 }}>{e.km != null ? `${kmTxt(e.km)} · ` : ""}{e.h24 ? "Abierta 24 h" : e.horario}</div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 900 }}>{precioLitro(e.precio)}</div>
            {filas.length > 1 && Math.abs(dif) >= 0.001 && <div style={{ fontSize: 11.5, fontWeight: 700, color: dif < 0 ? C.green : C.red }}>{dif < 0 ? "−" : "+"}{precioLitro(Math.abs(dif))}</div>}
          </div>
        </a>); })}
      {filas.length > cuantas && <button className="nb" onClick={() => setCuantas((n) => n + 20)} style={{ width: "100%", margin: "6px 0 10px", padding: 10, borderRadius: 10, border: `1px solid ${C.border}`, background: C.surf, color: C.t1, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Ver más ({filas.length - cuantas})</button>}
    </div>}

    {datos && <div style={{ fontSize: 11.5, color: viejo ? C.red : C.t3, lineHeight: 1.55, marginBottom: 8 }} aria-label="Fuente de los precios">
      Precios bajados el {horaTxt}{estado === "cargando" ? " · actualizando…" : ""}.{viejo ? " Son antiguos: actualiza cuando tengas cobertura." : ""} Fuente: Geoportal de Gasolineras del Ministerio. Son los que comunica cada estación; el del surtidor manda.
      {estado !== "cargando" && <button className="nb" onClick={() => { forzar.current = true; setRecarga((n) => n + 1); }} style={{ display: "block", marginTop: 8, padding: "7px 12px", borderRadius: 10, border: `1px solid ${C.border}`, background: C.surf, color: C.t2, fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Actualizar precios</button>}
    </div>}
  </>);
}

// ═══════════════════════════════════════════════════════════════════════════
// LLEGADAS AL AEROPUERTO
// Los horarios de vuelos no son un dato abierto: hay que pedirlos con una clave
// de pago (AeroDataBox), y esa clave no puede ir dentro de la app. La guarda el
// servidor (Supabase, función «llegadas»), que pregunta como mucho cada media
// hora y le sirve a la app la lista ya preparada:
//
//   { "actualizado": "2026-11-11T21:00:00Z",
//     "vuelos": [{ "hora": "2026-11-11T20:35:00Z", "prevista": "…", "terminal": "T4",
//                  "origen": "Londres", "num": "IB3167", "cia": "Iberia", "estado": "" }] }
//
// "hora" es la programada y "prevista" la que da el aeropuerto si hay retraso.
// Para el taxi, T4S cuenta como T4 (se sale por la T4) y T3 como T2.
// Si el servidor no contesta o devuelve la lista vacía (se puede apagar desde
// allí), la pantalla ni se ofrece.
// ═══════════════════════════════════════════════════════════════════════════
const LLEGADAS_URL = "https://vkeslzurpaxiwgktlquf.supabase.co/functions/v1/llegadas";
const TERMINALES = ["T1", "T2", "T4"];
const LLEGADAS_VIEJAS = 3 * 3600 * 1000;   // pasado este tiempo, ya no se ofrecen
const limpiarLlegadas = (crudo) => {
  if (!crudo || typeof crudo !== "object" || !Array.isArray(crudo.vuelos)) return null;
  const actualizado = Date.parse(crudo.actualizado);
  if (!Number.isFinite(actualizado)) return null;
  const vuelos = [];
  for (const v of crudo.vuelos) {
    if (!v || typeof v !== "object") continue;
    const prog = Date.parse(v.hora);
    if (!Number.isFinite(prog)) continue;
    const p = Date.parse(v.prevista);
    let t = String(v.terminal == null ? "" : v.terminal).toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (t && t[0] !== "T") t = "T" + t;
    if (t === "T4S") t = "T4";
    if (t === "T3") t = "T2";
    vuelos.push({ prog, prev: Number.isFinite(p) ? p : prog, t: TERMINALES.includes(t) ? t : "", origen: textoCorto(v.origen, 40), num: textoCorto(v.num, 10), cia: textoCorto(v.cia, 30), cancelado: v.estado === "cancelado" });
  }
  vuelos.sort((a, b) => a.prev - b.prev);
  return { actualizado, vuelos };
};
const llegadasVigentes = (ll, ahora) => !!ll && ahora - ll.actualizado < LLEGADAS_VIEJAS && ll.vuelos.some((v) => !v.cancelado && v.prev > ahora);
const horaCorta = (ms) => new Date(ms).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
const cuantosVuelos = (n) => `${n} ${n === 1 ? "vuelo" : "vuelos"}`;
// Lo que llega en la próxima hora y lo que acaba de aterrizar.
const resumenLlegadas = (ll, ahora) => {
  const vivos = ll.vuelos.filter((v) => !v.cancelado);
  const hora = vivos.filter((v) => v.prev > ahora && v.prev <= ahora + 3600000);
  const recien = vivos.filter((v) => v.prev <= ahora && v.prev > ahora - 30 * 60000);
  return { hora, recien, porTerminal: TERMINALES.map((t) => [t, hora.filter((v) => v.t === t).length]) };
};

function Aeropuerto({ llegadas, alVolver }) {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setAhora(Date.now()), 30000); return () => clearInterval(id); }, []);
  const [terminal, setTerminal] = useState("");
  const [cuantos, setCuantos] = useState(12);
  const { hora, recien, porTerminal } = useMemo(() => resumenLlegadas(llegadas, ahora), [llegadas, ahora]);
  const vivos = useMemo(() => llegadas.vuelos.filter((v) => !v.cancelado && (!terminal || v.t === terminal)), [llegadas, terminal]);
  // Las próximas doce horas, de hora en hora de reloj.
  const tramos = useMemo(() => {
    const ini = new Date(ahora); ini.setMinutes(0, 0, 0);
    return Array.from({ length: 12 }, (_, i) => { const a = ini.getTime() + i * 3600000; return { a, n: vivos.filter((v) => v.prev >= Math.max(a, ahora) && v.prev < a + 3600000).length }; });
  }, [vivos, ahora]);
  const tope = Math.max(1, ...tramos.map((t) => t.n));
  const pico = tramos.reduce((m, t) => (t.n > m.n ? t : m), tramos[0]);
  const proximos = vivos.filter((v) => v.prev > ahora);
  const viejo = ahora - llegadas.actualizado > 3600000;
  const chip = (on) => ({ padding: "8px 14px", borderRadius: 999, border: `1px solid ${on ? C.acc : C.border}`, background: on ? `${C.acc}22` : C.surf, color: on ? C.accDim : C.t2, fontWeight: on ? 800 : 600, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" });
  const etiqueta = { fontSize: 11, color: C.t2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 };

  return (<>
    <button className="nb" onClick={alVolver} style={{ background: "none", border: "none", padding: "2px 0", marginBottom: 8, color: C.accDim, fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>‹ Calendario</button>
    <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 4 }}>Llegadas al aeropuerto</div>
    <div style={{ fontSize: 12, color: C.t2, marginBottom: 12 }}>Vuelos que aterrizan en Barajas, por terminal.</div>

    <div style={{ ...card, padding: 16, marginBottom: 12, borderColor: `${C.blue}55` }} aria-label="Próxima hora">
      <div style={etiqueta}>En la próxima hora</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
        <span style={{ fontSize: 34, fontWeight: 900, color: C.blue, letterSpacing: -0.5 }}>{hora.length}</span>
        <span style={{ fontSize: 14, fontWeight: 800, color: C.t2 }}>{hora.length === 1 ? "vuelo" : "vuelos"}</span>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        {porTerminal.map(([t, n]) => <div key={t} style={{ flex: 1, background: C.inp, border: `1px solid ${C.linea}`, borderRadius: 12, padding: "9px 6px", textAlign: "center" }}>
          <div style={{ fontSize: 11, color: C.t3, fontWeight: 800 }}>{t}</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: n ? C.t1 : C.t3 }}>{n}</div>
        </div>)}
      </div>
      <div style={{ fontSize: 12.5, color: C.t1, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.linea}`, lineHeight: 1.5 }}>
        {recien.length ? <>Han aterrizado <strong>{cuantosVuelos(recien.length)}</strong> en la última media hora: su gente está saliendo ahora.</> : <>No ha aterrizado ninguno en la última media hora.</>}
      </div>
    </div>

    <div role="group" aria-label="Terminal" style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2, marginBottom: 10 }}>
      {[["", "Todas"], ...TERMINALES.map((t) => [t, t])].map(([t, nombre]) => <button key={nombre} className="nb" aria-pressed={terminal === t} onClick={() => { setTerminal(t); setCuantos(12); }} style={chip(terminal === t)}>{nombre}</button>)}
    </div>

    <div style={{ ...card, padding: 16, marginBottom: 12 }} aria-label="Llegadas por hora">
      <div style={etiqueta}>Las próximas 12 horas{terminal ? ` · ${terminal}` : ""}</div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 110, marginTop: 14 }}>
        {tramos.map((t) => <div key={t.a} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: t === pico && t.n ? C.accDim : C.t3, marginBottom: 3 }}>{t.n || ""}</div>
          <div style={{ width: "100%", height: `${Math.round((t.n / tope) * 78)}px`, minHeight: t.n ? 3 : 1, borderRadius: 5, background: t === pico && t.n ? C.acc : t.n ? `${C.blue}99` : C.linea }} />
        </div>)}
      </div>
      <div style={{ display: "flex", gap: 4, marginTop: 5 }}>
        {tramos.map((t, i) => <div key={t.a} style={{ flex: 1, textAlign: "center", fontSize: 10, color: C.t3, fontWeight: 600 }}>{i % 2 === 0 ? `${new Date(t.a).getHours()}h` : ""}</div>)}
      </div>
      {pico.n > 0 && <div style={{ fontSize: 12.5, color: C.t1, marginTop: 12, lineHeight: 1.5 }}>El pico{terminal ? ` de la ${terminal}` : ""}: de <strong>{horaCorta(pico.a)}</strong> a <strong>{horaCorta(pico.a + 3600000)}</strong>, con <strong>{cuantosVuelos(pico.n)}</strong>.</div>}
    </div>

    {proximos.length > 0 ? <div style={{ ...card, padding: "4px 14px", marginBottom: 12 }} aria-label="Próximos vuelos">
      {proximos.slice(0, cuantos).map((v, i) => { const retraso = Math.round((v.prev - v.prog) / 60000); return (
        <div key={`${v.num}-${v.prog}-${i}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: i ? `1px solid ${C.linea}` : "none" }}>
          <div style={{ width: 54, flexShrink: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: retraso >= 15 ? C.red : C.t1 }}>{horaCorta(v.prev)}</div>
            {retraso >= 15 && <div style={{ fontSize: 10.5, color: C.t3, textDecoration: "line-through" }}>{horaCorta(v.prog)}</div>}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.origen || "Origen sin indicar"}</div>
            <div style={{ fontSize: 11.5, color: C.t3, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{[v.num, v.cia].filter(Boolean).join(" · ")}{retraso >= 15 ? ` · ${retraso} min de retraso` : ""}</div>
          </div>
          <div style={{ flexShrink: 0, minWidth: 34, textAlign: "center", padding: "4px 7px", borderRadius: 8, background: v.t ? `${C.blue}18` : C.inp, color: v.t ? C.blue : C.t3, fontSize: 12, fontWeight: 900 }}>{v.t || "—"}</div>
        </div>); })}
      {proximos.length > cuantos && <button className="nb" onClick={() => setCuantos((n) => n + 20)} style={{ width: "100%", margin: "6px 0 10px", padding: 10, borderRadius: 10, border: `1px solid ${C.border}`, background: C.surf, color: C.t1, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Ver más ({proximos.length - cuantos})</button>}
    </div> : <div role="status" style={{ ...card, padding: 16, marginBottom: 12, fontSize: 13, color: C.t2 }} aria-label="Sin vuelos">No hay más llegadas{terminal ? ` en la ${terminal}` : ""} en los datos de ahora.</div>}

    <div style={{ fontSize: 11.5, color: viejo ? C.red : C.t3, lineHeight: 1.55, marginBottom: 8 }} aria-label="Hora de los datos">
      Datos de las {horaCorta(llegadas.actualizado)}.{viejo ? " Tienen más de una hora: los retrasos pueden haber cambiado." : ""} La T4S cuenta como T4, que es por donde se sale. Los horarios pueden cambiar sin aviso.
    </div>
  </>);
}

// ═══════════════════════════════════════════════════════════════════════════
// LAS DOS CARAS DE TXPRO: CONDUCTOR Y EMPRESA O FLOTA
// El conductor lleva sus cuentas como siempre. La empresa da de alta a sus
// conductores y sus coches, ve las cuentas de cada uno y las de toda la flota
// (con las mismas operaciones que el Resumen del conductor: cuentasMes), y
// puede apuntar o corregir un día.
// El conductor que pertenece a una flota (vínculo) tiene el acuerdo que le
// pone la empresa y no lo puede cambiar; el que va por libre pone el suyo.
// Hoy todo vive en el móvil: las cuentas de un conductor llegan con su copia
// de seguridad y el vínculo, con un enlace de invitación. Cuando haya servidor
// e inicio de sesión llegarán solos, y lo único que cambia es de dónde salen
// `flota` (leerFlota) y el vínculo (leerVinculo).
// ═══════════════════════════════════════════════════════════════════════════
const ROL_KEY = "tc_rol";
const FLOTA_KEY = "tc_flota";
const VINCULO_KEY = "tc_vinculo";
// Sin rol guardado: quien ya tiene cuentas apuntadas es conductor; quien abre
// la app por primera vez elige.
const leerRol = () => {
  const r = loadStorage(ROL_KEY, null);
  if (r === "empresa" || r === "conductor") return r;
  try { return localStorage.getItem("tc_days") || localStorage.getItem("tc_cfg_ok") ? "conductor" : null; } catch { return "conductor"; }
};
const guardarRol = (r) => { try { localStorage.setItem(ROL_KEY, JSON.stringify(r)); } catch {} };
const ACUERDO_BASE = { modo: "porcentaje", pctConductor: 50, cuota: "", cuotaPor: "dia" };
const normAcuerdo = (a) => { const x = a && typeof a === "object" ? a : {}; return { modo: x.modo === "fijo" ? "fijo" : "porcentaje", pctConductor: Math.min(100, Math.max(0, num(x.pctConductor === undefined ? 50 : x.pctConductor))), cuota: Math.max(0, num(x.cuota)), cuotaPor: x.cuotaPor === "mes" ? "mes" : "dia" }; };
const acuerdoTxt = (a) => (a.modo === "fijo" ? `Cuota de ${fmt0(num(a.cuota))} ${a.cuotaPor === "mes" ? "al mes" : "por día"}` : `Al ${num(a.pctConductor)} %`);
const diasLimpios = (dias) => Object.fromEntries(Object.entries(dias && typeof dias === "object" ? dias : {}).filter(([d, v]) => /^\d{4}-\d{2}-\d{2}$/.test(d) && v && typeof v === "object" && hasData(v)).map(([d, v]) => [d, migrateDay(v)]));
const normConductor = (c) => ({
  id: String(c.id), nombre: String(c.nombre || "").trim(), telefono: String(c.telefono || "").trim(), alta: /^\d{4}-\d{2}-\d{2}$/.test(c.alta || "") ? c.alta : todayStr(),
  acuerdo: { ...ACUERDO_BASE, ...(c.acuerdo && typeof c.acuerdo === "object" ? c.acuerdo : {}) }, plataformas: normPlataformas(c.plataformas),
  days: diasLimpios(c.days), gastos: Array.isArray(c.gastos) ? c.gastos.filter(gastoValido) : [], actualizado: typeof c.actualizado === "string" ? c.actualizado : "", ejemplo: !!c.ejemplo,
});
// Los coches de la empresa: matrícula, licencia, quién lo lleva y sus gastos.
const CONCEPTOS_COCHE = ["Seguro", "Taller", "ITV", "Neumáticos", "Gestoría", "Letra", "Otros"];
const normVehiculo = (v) => ({ id: String(v.id), matricula: String(v.matricula || "").trim().toUpperCase().slice(0, 12), licencia: String(v.licencia || "").trim().slice(0, 16), modelo: String(v.modelo || "").trim().slice(0, 40), conductorId: v.conductorId ? String(v.conductorId) : "", gastos: Array.isArray(v.gastos) ? v.gastos.filter(gastoValido) : [], ejemplo: !!v.ejemplo });
const gastosCocheMes = (v, ym) => v.gastos.reduce((a, g) => (monthKey(g.date) === ym ? a + (Number(g.importe) || 0) : a), 0);
const leerFlota = () => {
  const f = loadStorage(FLOTA_KEY, null);
  return {
    empresa: f && typeof f.empresa === "string" ? f.empresa : "",
    conductores: (f && Array.isArray(f.conductores) ? f.conductores : []).filter((c) => c && c.id && c.nombre).map(normConductor),
    vehiculos: (f && Array.isArray(f.vehiculos) ? f.vehiculos : []).filter((v) => v && v.id && v.matricula).map(normVehiculo),
  };
};
// Las cuentas de un mes de un conductor con su acuerdo: lo mismo que ve él.
const cuentasMes = (c, ym) => {
  const a = c.acuerdo; const fijo = a.modo === "fijo"; const cuota = num(a.cuota); const porMes = fijo && a.cuotaPor === "mes";
  const entries = Object.entries(c.days).filter(([d]) => monthKey(d) === ym).sort(([x], [y]) => x.localeCompare(y));
  const g = gastosEntre(c.gastos, c.days, ym + "-01", finDeMes(ym));
  const s = summarize(entries, fijo ? { cuotaDia: porMes ? 0 : cuota } : num(a.pctConductor), c.plataformas, porMes && entries.length ? cuota : 0);
  return { ...s, entries, gastos: g, saldo: s.diferenciaMes - g.reembolsable, porMes, fijo };
};
// Una flota de ejemplo, para ver cómo queda el panel antes de dar de alta a nadie.
const flotaDeEjemplo = () => {
  const hoy = new Date();
  const hacer = (i, nombre, acuerdo, semilla, libra) => {
    const days = {};
    for (let k = 0; k < 45; k++) {
      const x = new Date(hoy); x.setDate(hoy.getDate() - k); if (x.getDay() === libra) continue;
      const r = (k * semilla + i * 11) % 60; const finde = x.getDay() === 5 || x.getDay() === 6 ? 40 : 0;
      days[ymd(x)] = { taximetro: 120 + r + finde, visa: 30 + (r % 40), uber: 30 + (r % 25), uberEfec: 5 + (r % 10), cabify: 10 + (r % 20), cabifyEfec: 0, bolt: 0, boltEfec: 0, fnt9: 0, fncob: 0, carreras: 10 + (r % 7), inicio: "07:00", fin: "16:00" };
    }
    return normConductor({ id: `ejemplo-${i}`, nombre, telefono: "", acuerdo, days, gastos: [], actualizado: new Date().toISOString(), ejemplo: true });
  };
  const dia = (n) => ymd(new Date(hoy.getFullYear(), hoy.getMonth(), Math.min(n, hoy.getDate())));
  return {
    conductores: [hacer(1, "Antonio García", { modo: "porcentaje", pctConductor: 50 }, 37, 2), hacer(2, "Karim Benali", { modo: "fijo", cuota: "125", cuotaPor: "dia" }, 29, 3), hacer(3, "Lucía Fernández", { modo: "porcentaje", pctConductor: 45 }, 41, 1)],
    vehiculos: [
      normVehiculo({ id: "ejemplo-v1", matricula: "1234 LBC", licencia: "05123", modelo: "Toyota Corolla", conductorId: "ejemplo-1", ejemplo: true, gastos: [{ id: 1, date: dia(2), concepto: "Seguro", importe: 142 }, { id: 2, date: dia(6), concepto: "Taller", importe: 95.5 }] }),
      normVehiculo({ id: "ejemplo-v2", matricula: "5678 MDF", licencia: "11870", modelo: "Dacia Jogger", conductorId: "ejemplo-2", ejemplo: true, gastos: [{ id: 3, date: dia(3), concepto: "Seguro", importe: 138 }] }),
      normVehiculo({ id: "ejemplo-v3", matricula: "9012 KXH", licencia: "08456", modelo: "Toyota Prius+", conductorId: "ejemplo-3", ejemplo: true, gastos: [{ id: 4, date: dia(4), concepto: "ITV", importe: 48 }] }),
    ],
  };
};
// EL VÍNCULO CON UNA FLOTA. La empresa manda al conductor un enlace de
// invitación con su acuerdo; al aceptarlo, el acuerdo queda fijado por ella.
// Lo que llega en el enlace viene de fuera: se limpia y se recorta todo.
const normVinculo = (v) => { const x = v && typeof v === "object" ? v : {}; return { empresa: String(x.empresa || "").trim().slice(0, 60), nombre: String(x.nombre || "").trim().slice(0, 60), acuerdo: normAcuerdo(x.acuerdo), desde: /^\d{4}-\d{2}-\d{2}$/.test(x.desde || "") ? x.desde : todayStr() }; };
const leerVinculo = () => { const v = loadStorage(VINCULO_KEY, null); return v && typeof v === "object" && v.acuerdo ? normVinculo(v) : null; };
const codificarInvitacion = (empresa, c) => { const json = JSON.stringify({ v: 1, e: empresa, n: c.nombre, a: normAcuerdo(c.acuerdo) }); return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const leerInvitacion = () => {
  try {
    const p = new URLSearchParams(window.location.search).get("alta"); if (!p || p.length > 2000) return null;
    const d = JSON.parse(decodeURIComponent(escape(atob(p.replace(/-/g, "+").replace(/_/g, "/")))));
    if (!d || d.v !== 1 || !d.a || typeof d.a !== "object") return null;
    return normVinculo({ empresa: d.e, nombre: d.n, acuerdo: d.a });
  } catch { return null; }
};
const quitarInvitacionDeLaUrl = () => { try { window.history.replaceState(null, "", window.location.pathname); } catch {} };
// El tema (claro, oscuro o el del móvil), igual para las dos caras.
const useTema = () => {
  const [tema, setTema] = useState(leerTema);
  const [oscuroSistema, setOscuroSistema] = useState(movilOscuro);
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const cambia = (e) => setOscuroSistema(e.matches);
    if (mq.addEventListener) mq.addEventListener("change", cambia); else if (mq.addListener) mq.addListener(cambia);
    return () => { if (mq.removeEventListener) mq.removeEventListener("change", cambia); else if (mq.removeListener) mq.removeListener(cambia); };
  }, []);
  // Antes de pintar nada: así todo lo de abajo ya lee los colores buenos.
  aplicarTema(temaReal(tema, oscuroSistema));
  const elegirTema = (t) => { setTema(t); try { localStorage.setItem(TEMA_KEY, JSON.stringify(t)); } catch {} };
  return [tema, elegirTema];
};
const SelectorTema = ({ tema, elegirTema }) => (
  <div role="radiogroup" aria-label="Apariencia" style={{ display: "flex", gap: 7 }}>
    {TEMAS.map(([t, etiqueta]) => (
      <button key={t} className="nb" role="radio" aria-checked={tema === t} onClick={() => elegirTema(t)} style={{ flex: 1, padding: "10px 6px", borderRadius: 10, border: `1.5px solid ${tema === t ? C.acc : C.border}`, background: tema === t ? `${C.acc}1c` : C.surf, color: tema === t ? C.accDim : C.t2, fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>{etiqueta}</button>
    ))}
  </div>
);
const Portada = ({ children }) => (
  <div style={{ maxWidth: 480, margin: "0 auto", minHeight: "100vh", background: C.bg, color: C.t1, fontFamily: "'DM Sans', sans-serif", padding: "calc(44px + env(safe-area-inset-top, 0px)) 20px 32px" }}>
    <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}><TXLogo size={68} /></div>
    <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: -0.5, textAlign: "center" }}>TX<span style={{ color: C.accDim }}>pro</span></div>
    {children}
  </div>
);
// LA ENTRADA: la primera vez se elige cómo se va a usar la app. Aquí irá el
// inicio de sesión cuando haya cuentas en la nube.
const Entrada = ({ alElegir }) => {
  useTema();
  const opcion = { width: "100%", display: "flex", alignItems: "center", gap: 14, textAlign: "left", padding: 16, borderRadius: 16, border: `1.5px solid ${C.border}`, background: C.surf, boxShadow: C.sombra, cursor: "pointer", fontFamily: "inherit", color: C.t1, marginBottom: 12 };
  const icono = { width: 46, height: 46, borderRadius: 14, background: `${C.acc}1c`, color: C.accDim, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 };
  return (
    <Portada>
      <div style={{ fontSize: 14, color: C.t2, textAlign: "center", margin: "6px 0 28px" }}>Las cuentas del taxi, claras y al día.</div>
      <div style={{ fontSize: 12, color: C.t2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>¿Cómo vas a usar TXpro?</div>
      <button className="nb" onClick={() => alElegir("conductor")} style={opcion}>
        <span style={icono}><TaxiLogo size={24} color={C.accDim} /></span>
        <span style={{ flex: 1 }}><span style={{ display: "block", fontSize: 16, fontWeight: 900 }}>Soy conductor</span><span style={{ display: "block", fontSize: 12.5, color: C.t2, marginTop: 2, lineHeight: 1.4 }}>Apunto mi día y veo mis cuentas con la empresa.</span></span>
        <span style={{ color: C.t3, fontSize: 20 }}>›</span>
      </button>
      <button className="nb" onClick={() => alElegir("empresa")} style={opcion}>
        <span style={icono}><Icono name="flota" size={25} /></span>
        <span style={{ flex: 1 }}><span style={{ display: "block", fontSize: 16, fontWeight: 900 }}>Soy empresa o flota</span><span style={{ display: "block", fontSize: 12.5, color: C.t2, marginTop: 2, lineHeight: 1.4 }}>Doy de alta a mis conductores y mis coches, y llevo las cuentas de cada uno.</span></span>
        <span style={{ color: C.t3, fontSize: 20 }}>›</span>
      </button>
      <div style={{ fontSize: 12, color: C.t3, textAlign: "center", lineHeight: 1.5, marginTop: 14 }}>Podrás cambiarlo cuando quieras en Ajustes.<br />Tus datos se guardan en este móvil.</div>
    </Portada>
  );
};
// LA INVITACIÓN: lo que ve el conductor al abrir el enlace de su empresa.
const Invitacion = ({ inv, alAceptar, alRechazar }) => {
  useTema();
  return (
    <Portada>
      <div style={{ ...card, padding: 18, marginTop: 24 }} aria-label="Invitación a una flota">
        <div style={{ fontSize: 12, color: C.t2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Invitación a una flota</div>
        <div style={{ fontSize: 17, fontWeight: 900, lineHeight: 1.3, marginBottom: 10 }}>{inv.empresa || "Tu empresa"} te ha dado de alta{inv.nombre ? ` como ${inv.nombre}` : ""}</div>
        <div style={{ background: `${C.acc}12`, border: `1px solid ${C.acc}33`, borderRadius: 12, padding: "10px 12px", marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: C.t3, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>Tu acuerdo</div>
          <div style={{ fontSize: 16, fontWeight: 900, color: C.accDim, marginTop: 2 }}>{acuerdoTxt(inv.acuerdo)}</div>
        </div>
        <div style={{ fontSize: 12.5, color: C.t2, lineHeight: 1.5, marginBottom: 14 }}>Si aceptas, tus cuentas se harán con este acuerdo, que <strong style={{ color: C.t1 }}>lo fija la empresa</strong>: no podrás cambiarlo desde tu app. Tus días apuntados no se tocan. Podrás salir de la flota en Ajustes.</div>
        <button className="saveBtn" onClick={alAceptar} style={{ width: "100%", padding: 13, borderRadius: 12, border: "none", background: `linear-gradient(135deg,${C.acc},${C.accDim})`, color: "#0d0f14", fontWeight: 900, fontSize: 14.5, cursor: "pointer", fontFamily: "inherit" }}>Aceptar y unirme</button>
        <button className="nb" onClick={alRechazar} style={{ width: "100%", marginTop: 10, padding: 11, borderRadius: 10, border: `1px solid ${C.border}`, background: C.surf, color: C.t2, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Ahora no</button>
      </div>
    </Portada>
  );
};
// EL PANEL DE LA EMPRESA
function Flota({ alCambiarRol }) {
  const [tema, elegirTema] = useTema();
  const [flota, setFlota] = useState(leerFlota);
  const [vista, setVista] = useState("panel");
  const [idSel, setIdSel] = useState(null);
  const [mes, setMes] = useState(() => monthKey(todayStr()));
  const NUEVO = { id: null, nombre: "", telefono: "", ...ACUERDO_BASE };
  const [ficha, setFicha] = useState(NUEVO);
  const [diaForm, setDiaForm] = useState({ fecha: todayStr(), v: {} });
  const COCHE_NUEVO = { id: null, matricula: "", licencia: "", modelo: "", conductorId: "" };
  const [coche, setCoche] = useState(COCHE_NUEVO);
  const [gastoCoche, setGastoCoche] = useState({ date: todayStr(), concepto: CONCEPTOS_COCHE[0], importe: "" });
  const [aviso, setAviso] = useState("");
  const [enlace, setEnlace] = useState("");
  useEffect(() => { try { localStorage.setItem(FLOTA_KEY, JSON.stringify(flota)); } catch {} }, [flota]);
  const conductores = flota.conductores; const vehiculos = flota.vehiculos;
  const sel = conductores.find((c) => c.id === idSel) || null;
  const cocheSel = vehiculos.find((v) => v.id === coche.id) || null;
  const mesHoy = monthKey(todayStr());
  const cuentas = useMemo(() => conductores.map((c) => ({ c, m: cuentasMes(c, mes) })), [conductores, mes]);
  const hayEjemplo = conductores.some((c) => c.ejemplo) || vehiculos.some((v) => v.ejemplo);
  const ir = (v) => { setVista(v); setAviso(""); setEnlace(""); setTimeout(() => { try { window.scrollTo(0, 0); } catch {} }, 0); };
  const abrir = (id) => { setIdSel(id); ir("conductor"); };
  const cambiaConductor = (id, f) => setFlota((fl) => ({ ...fl, conductores: fl.conductores.map((c) => (c.id === id ? f(c) : c)) }));
  const cambiaCoche = (id, f) => setFlota((fl) => ({ ...fl, vehiculos: fl.vehiculos.map((v) => (v.id === id ? f(v) : v)) }));
  const nuevaFicha = () => { setFicha(NUEVO); ir("ficha"); };
  const editarFicha = (c) => { setFicha({ id: c.id, nombre: c.nombre, telefono: c.telefono, ...c.acuerdo }); ir("ficha"); };
  const guardarFicha = () => {
    const nombre = ficha.nombre.trim(); if (!nombre) return;
    const acuerdo = { modo: ficha.modo === "fijo" ? "fijo" : "porcentaje", pctConductor: ficha.pctConductor, cuota: ficha.cuota, cuotaPor: ficha.cuotaPor === "mes" ? "mes" : "dia" };
    const id = ficha.id || `c${Date.now()}`;
    setFlota((f) => ({ ...f, conductores: ficha.id ? f.conductores.map((c) => (c.id === id ? { ...c, nombre, telefono: ficha.telefono.trim(), acuerdo } : c)) : [...f.conductores, normConductor({ id, nombre, telefono: ficha.telefono, acuerdo })] }));
    abrir(id);
  };
  const darDeBaja = (c) => { if (!window.confirm(`¿Dar de baja a ${c.nombre}? Se borran sus cuentas de este móvil.`)) return; setFlota((f) => ({ ...f, conductores: f.conductores.filter((x) => x.id !== c.id), vehiculos: f.vehiculos.map((v) => (v.conductorId === c.id ? { ...v, conductorId: "" } : v)) })); ir("panel"); };
  // Hasta que haya inicio de sesión, las cuentas de un conductor llegan con su
  // copia de seguridad (Ajustes → Copia de seguridad, en su móvil).
  const cargarCuentas = async (c, file) => {
    if (!file) return;
    try {
      const datos = JSON.parse(await file.text());
      if (!datos || !["txpro", "taxicuentas"].includes(datos.app) || typeof datos.days !== "object" || datos.days === null) { setAviso("Ese archivo no es una copia de TXpro."); return; }
      const days = diasLimpios(datos.days);
      cambiaConductor(c.id, (x) => ({ ...x, days, gastos: Array.isArray(datos.gastos) ? datos.gastos.filter(gastoValido) : [], plataformas: normPlataformas(datos.cfg && datos.cfg.plataformas), actualizado: new Date().toISOString(), ejemplo: false }));
      setAviso(`Cargados ${Object.keys(days).length} días de ${c.nombre}.`);
    } catch { setAviso("No se pudo leer el archivo."); }
  };
  // La empresa también puede apuntar o corregir un día del conductor.
  const valoresDia = (c, fecha) => { const d = c.days[fecha] || {}; const v = {}; for (const k of clavesDia(c.plataformas)) v[k] = Number(d[k]) ? String(d[k]) : ""; return v; };
  const abrirDia = (c, fecha) => { setDiaForm({ fecha, v: valoresDia(c, fecha) }); ir("dia"); };
  const guardarDia = () => {
    if (!sel) return; const { fecha } = diaForm;
    const limpio = {}; for (const k of clavesDia(sel.plataformas)) limpio[k] = Math.max(0, evalSuma(diaForm.v[k]));
    const nuevo = { ...(sel.days[fecha] || {}), ...limpio };
    cambiaConductor(sel.id, (x) => { const days = { ...x.days }; if (hasData(nuevo)) days[fecha] = nuevo; else delete days[fecha]; return { ...x, days, actualizado: new Date().toISOString(), ejemplo: false }; });
    setMes(monthKey(fecha)); ir("conductor"); setAviso(`Guardado el ${dayMonth(fecha)}.`);
  };
  // El informe en PDF de un conductor, con las cuentas de la empresa con él.
  const informeConductor = async (c) => {
    if (aviso === "Preparando el informe…") return; setAviso("Preparando el informe…"); let fin = "";
    try {
      const m = cuentasMes(c, mes); const a = c.acuerdo; const d = desgloseDe(m.entries, c.plataformas); const dif = m.saldo;
      const dias = m.rows.filter((r) => r.s.facturacion > 0).length;
      const balance = Math.abs(dif) < 0.005 ? null : dif < 0 ? { label: "La empresa debe al conductor", val: fmt(-dif), color: "verde" } : m.porMes && mes >= mesHoy ? { label: "Faltan para cubrir la cuota del mes", val: fmt(dif), color: "oro" } : { label: "El conductor debe a la empresa", val: fmt(dif), color: "rojo" };
      if (balance && m.gastos.reembolsable > 0) balance.sub = "Incluye los gastos que devuelve la empresa";
      const reparto = m.fijo
        ? [{ label: m.porMes ? "Cuota mensual a la empresa" : `Cuota a la empresa (${fmt0(num(a.cuota))} × ${dias} ${dias === 1 ? "día" : "días"})`, val: fmt(m.parteEmpresaMes) }, { label: "Para el conductor, quitada la cuota", val: fmt(m.conductorMes), fuerte: true, color: "oro" }]
        : [{ label: `${num(a.pctConductor)}% conductor s/ facturación base`, val: fmt(m.conductorMes), fuerte: true, color: "oro" }, { label: "Parte de la empresa", val: fmt(m.parteEmpresaMes) }];
      const coches = vehiculos.filter((v) => v.conductorId === c.id).map((v) => `${v.matricula}${v.licencia ? ` (licencia ${v.licencia})` : ""}`).join(", ");
      const inf = {
        titulo: `${c.nombre} · ${monthLabel(mes)}`, sub: `${flota.empresa || "Liquidación con la empresa"}${coches ? ` · ${coches}` : ""} · generado el ${new Date().toLocaleDateString("es-ES")}`,
        total: fmt(m.totalFact), totalSub: `Facturado · ${m.diasTrabajados} ${m.diasTrabajados === 1 ? "día" : "días"} · media ${fmt0(m.mediaDiaria)} al día · ${acuerdoTxt(a).toLowerCase()}`,
        fichas: [{ label: "Parte de la empresa", val: fmt(m.parteEmpresaMes) }, { label: "Cobrado por la empresa", val: fmt(m.totalCobradoEmpresa) }, { label: "Efectivo del conductor", val: fmt(m.efectivoMes) }],
        nota: "", balance,
        desglose: { filas: d.filas.map((f) => ({ nombre: f.nombre, fact: fmt(f.fact), efec: fmt(f.efec) })), tarjeta: d.tarjeta ? fmt(d.tarjeta) : "", totalFact: fmt(d.totalFact), totalEfec: fmt(d.totalEfec) },
        liquidacionTitulo: "Liquidación del mes",
        liquidacion: [...reparto, { label: "Cobrado por la empresa (apps y tarjeta)", val: fmt(m.totalCobradoEmpresa) }, { label: "Efectivo cobrado por el conductor", val: fmt(m.efectivoMes), color: "azul" }, ...(m.gastos.reembolsable > 0 ? [{ label: "Gastos que devuelve la empresa", val: fmt(m.gastos.reembolsable), color: "verde" }] : [])],
        jornada: [],
        gastos: c.gastos.filter((g) => monthKey(g.date) === mes && g.reembolsable).sort((x, y) => x.date.localeCompare(y.date)).map((g) => ({ label: `${g.concepto} · ${dayMonth(g.date)} · lo devuelve la empresa`, val: "−" + fmt(Number(g.importe) || 0) })),
        dias: m.porMes
          ? { cols: ["Fecha", "Facturado", "Cobró empresa", "Efectivo"], filas: m.rows.map((r) => [`${weekday(r.date)} ${dayMonth(r.date)}`, fmt(r.s.facturacion), fmt(r.s.cobradoEmpresa), fmt(r.s.facturacion - r.s.cobradoEmpresa)]) }
          : { cols: ["Fecha", "Facturado", "Cobró empresa", "Efectivo", "Conductor", "Diferencia"], filas: m.rows.map((r) => [`${weekday(r.date)} ${dayMonth(r.date)}`, fmt(r.s.facturacion), fmt(r.s.cobradoEmpresa), fmt(r.s.facturacion - r.s.cobradoEmpresa), fmt(r.s.conductor50), { v: (r.s.diferencia <= 0 ? "−" : "+") + fmt(Math.abs(r.s.diferencia)), color: r.s.diferencia <= 0 ? "verde" : "rojo" }]) },
      };
      const limpio = c.nombre.normalize("NFD").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "conductor";
      const como = await entregarArchivo(await crearInformePDF(inf), `TXpro-${mes}-${limpio}.pdf`, inf.titulo);
      fin = como === "descargado" ? "Informe descargado" : "";
    } catch { fin = "No se pudo crear el informe en este móvil"; }
    setAviso(fin);
  };
  // La invitación: un enlace con el acuerdo, para que el conductor quede
  // vinculado a la flota desde su TXpro.
  const invitar = async (c) => {
    const url = `${window.location.origin}${window.location.pathname}?alta=${codificarInvitacion(flota.empresa.trim(), c)}`;
    setEnlace(url);
    const texto = `${flota.empresa.trim() || "Tu empresa"} te ha dado de alta en TXpro. Abre este enlace en tu móvil para unirte a la flota:`;
    try { if (navigator.share) { await navigator.share({ title: "Invitación a TXpro", text: texto, url }); return; } } catch (e) { if (e && e.name === "AbortError") return; }
    try { await navigator.clipboard.writeText(`${texto} ${url}`); setAviso("Invitación copiada: pégala en WhatsApp"); } catch { setAviso("Copia el enlace de abajo y mándaselo al conductor"); }
  };
  // Coches
  const nuevoCoche = () => { setCoche(COCHE_NUEVO); ir("coche"); };
  const abrirCoche = (v) => { setCoche({ id: v.id, matricula: v.matricula, licencia: v.licencia, modelo: v.modelo, conductorId: v.conductorId }); setGastoCoche({ date: todayStr(), concepto: CONCEPTOS_COCHE[0], importe: "" }); ir("coche"); };
  const guardarCoche = () => {
    const matricula = coche.matricula.trim().toUpperCase(); if (!matricula) return;
    const id = coche.id || `v${Date.now()}`; const datos = { matricula, licencia: coche.licencia.trim(), modelo: coche.modelo.trim(), conductorId: coche.conductorId };
    setFlota((f) => ({ ...f, vehiculos: coche.id ? f.vehiculos.map((v) => (v.id === id ? { ...v, ...datos, ejemplo: false } : v)) : [...f.vehiculos, normVehiculo({ id, ...datos })] }));
    if (coche.id) { ir("coches"); } else { setCoche({ id, ...datos }); setAviso("Coche añadido. Ya puedes apuntar sus gastos."); }
  };
  const quitarCoche = (v) => { if (!window.confirm(`¿Quitar el coche ${v.matricula}? Se borran sus gastos.`)) return; setFlota((f) => ({ ...f, vehiculos: f.vehiculos.filter((x) => x.id !== v.id) })); ir("coches"); };
  const anadirGastoCoche = () => { const importe = Math.max(0, evalSuma(gastoCoche.importe)); if (!cocheSel || !importe) return; cambiaCoche(cocheSel.id, (v) => ({ ...v, gastos: [...v.gastos, { id: Date.now(), date: gastoCoche.date, concepto: gastoCoche.concepto, importe }] })); setGastoCoche((g) => ({ ...g, importe: "" })); };
  const inp = { width: "100%", background: C.inp, border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "11px 12px", color: C.t1, fontSize: 15, fontWeight: 700, fontFamily: "inherit" };
  const tit = { fontSize: 11, color: C.t2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 };
  const etq = { fontSize: 12, color: C.t2, fontWeight: 600, marginBottom: 5, display: "block" };
  const principal = { width: "100%", padding: 13, borderRadius: 12, border: "none", background: `linear-gradient(135deg,${C.acc},${C.accDim})`, color: "#0d0f14", fontWeight: 900, fontSize: 14.5, cursor: "pointer", fontFamily: "inherit" };
  const apagado = { background: C.apagado, color: C.t3, cursor: "default" };
  const secundario = { flex: 1, padding: 10, borderRadius: 10, border: `1px solid ${C.border}`, background: C.surf, color: C.t1, fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" };
  const dorado = { ...secundario, borderColor: `${C.acc}66`, background: `${C.acc}14`, color: C.accDim };
  const seg = (on) => ({ flex: 1, padding: "10px 4px", borderRadius: 10, border: `1.5px solid ${on ? C.acc : C.border}`, background: on ? `${C.acc}18` : C.surf, color: on ? C.accDim : C.t2, fontWeight: on ? 800 : 600, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" });
  const flecha = (on) => ({ background: C.surf, border: `1px solid ${C.border}`, borderRadius: 10, width: 34, height: 34, fontSize: 17, color: C.t2, cursor: on ? "pointer" : "default", fontFamily: "inherit", flexShrink: 0, opacity: on ? 1 : 0.35 });
  const fichaNum = { flex: 1, minWidth: 0, background: C.surf, border: `1px solid ${C.border}`, borderRadius: 12, padding: "9px 6px", textAlign: "center" };
  const fichaTit = { fontSize: 10.5, color: C.t3, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
  const fichaVal = { fontSize: 13.5, fontWeight: 900, whiteSpace: "nowrap", color: C.t1 };
  const volver = { background: "none", border: "none", padding: 0, marginBottom: 10, color: C.accDim, fontWeight: 800, fontSize: 13.5, cursor: "pointer", fontFamily: "inherit" };
  const corto = (v) => (Math.abs(v) >= 10000 ? fmt0(v) : fmt(v));
  const inicial = (n) => (n.trim()[0] || "?").toUpperCase();
  const nombreDe = (id) => { const c = conductores.find((x) => x.id === id); return c ? c.nombre : ""; };
  // Desde la empresa: saldo > 0, el conductor le debe; saldo < 0, ella le debe.
  const saldoTxt = (v) => (Math.abs(v) < 0.005 ? "En paz" : v > 0 ? `Te debe ${fmt(v)}` : `Le debes ${fmt(-v)}`);
  const saldoCol = (v) => (Math.abs(v) < 0.005 ? C.t3 : v > 0 ? C.green : C.red);
  const selectorMes = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12 }}>
      <button className="nb" onClick={() => setMes(mesVecino(mes, -1))} aria-label="Mes anterior" style={flecha(true)}>‹</button>
      <div style={{ fontSize: 15, fontWeight: 900, color: C.t1, textAlign: "center" }}>{capitalizar(monthLabel(mes))}</div>
      <button className="nb" disabled={mes >= mesHoy} onClick={() => mes < mesHoy && setMes(mesVecino(mes, 1))} aria-label="Mes siguiente" style={flecha(mes < mesHoy)}>›</button>
    </div>
  );
  const bandaEjemplo = hayEjemplo && (
    <div style={{ display: "flex", alignItems: "center", gap: 10, background: `${C.blue}0f`, border: `1px solid ${C.blue}44`, borderRadius: 12, padding: "9px 12px", marginBottom: 12 }}>
      <div style={{ flex: 1, fontSize: 12.5, color: C.t1 }}>Estás viendo una <strong>flota de ejemplo</strong>.</div>
      <button className="nb" onClick={() => setFlota((f) => ({ ...f, conductores: f.conductores.filter((c) => !c.ejemplo), vehiculos: f.vehiculos.filter((v) => !v.ejemplo) }))} style={{ background: "none", border: "none", color: C.blue, fontWeight: 800, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>Quitar</button>
    </div>
  );
  return (
    <div style={{ maxWidth: 480, margin: "0 auto", minHeight: "100vh", background: C.bg, color: C.t1, fontFamily: "'DM Sans', sans-serif", paddingBottom: "calc(80px + env(safe-area-inset-bottom, 0px))" }}>
      <div style={{ background: `linear-gradient(180deg, ${C.surf}, ${C.cabecera})`, borderBottom: `2px solid ${C.acc}40`, padding: "9px 16px 8px", paddingTop: "calc(9px + env(safe-area-inset-top, 0px))", position: "sticky", top: 0, zIndex: 10, boxShadow: "0 2px 14px rgba(30,34,54,0.08)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <TXLogo size={36} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 19, fontWeight: 900, letterSpacing: -0.5, color: C.t1, lineHeight: 1.1 }}>TX<span style={{ color: C.accDim }}>pro</span> <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase", color: C.accDim, background: `${C.acc}22`, borderRadius: 6, padding: "2px 6px", verticalAlign: "3px" }}>Empresa</span></div>
            {flota.empresa && <div style={{ fontSize: 11, color: C.t2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{flota.empresa}</div>}
          </div>
          <button className="nb" onClick={() => ir(vista === "ajustes" ? "panel" : "ajustes")} aria-label="Ajustes" style={{ background: vista === "ajustes" ? `${C.acc}22` : C.surf, border: `1px solid ${vista === "ajustes" ? C.acc : C.border}`, borderRadius: 11, width: 38, height: 38, cursor: "pointer", flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", color: vista === "ajustes" ? C.accDim : C.t2 }}><Icono name="ajustes" size={19} /></button>
        </div>
      </div>
      <div style={{ padding: 16 }}>
        {vista === "panel" && (() => {
          const conDatos = cuentas.filter((x) => x.m.totalFact > 0);
          const t = conDatos.reduce((a, x) => ({ fact: a.fact + x.m.totalFact, empresa: a.empresa + x.m.parteEmpresaMes, cobrado: a.cobrado + x.m.totalCobradoEmpresa, dias: a.dias + x.m.diasTrabajados }), { fact: 0, empresa: 0, cobrado: 0, dias: 0 });
          const teDeben = conDatos.filter((x) => x.m.saldo > 0.005); const debes = conDatos.filter((x) => x.m.saldo < -0.005);
          const sumaTeDeben = teDeben.reduce((a, x) => a + x.m.saldo, 0); const sumaDebes = debes.reduce((a, x) => a - x.m.saldo, 0);
          const gCoches = vehiculos.reduce((a, v) => a + gastosCocheMes(v, mes), 0);
          const orden = [...cuentas].sort((a, b) => b.m.totalFact - a.m.totalFact || a.c.nombre.localeCompare(b.c.nombre));
          if (!conductores.length) return (
            <div style={{ ...card, padding: 22, textAlign: "center" }} aria-label="Flota vacía">
              <div style={{ width: 54, height: 54, borderRadius: 16, background: `${C.acc}1c`, color: C.accDim, display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}><Icono name="flota" size={28} /></div>
              <div style={{ fontSize: 17, fontWeight: 900, marginBottom: 6 }}>Aún no tienes conductores</div>
              <div style={{ fontSize: 13, color: C.t2, lineHeight: 1.5, marginBottom: 16 }}>Da de alta a cada conductor con su acuerdo (porcentaje o cuota fija) y verás aquí sus cuentas y las de toda la flota.</div>
              <button className="saveBtn" onClick={nuevaFicha} style={principal}>Dar de alta un conductor</button>
              <button className="nb" onClick={() => setFlota((f) => ({ ...f, ...flotaDeEjemplo() }))} style={{ marginTop: 12, background: "none", border: "none", color: C.accDim, fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit", textDecoration: "underline" }}>Ver con una flota de ejemplo</button>
            </div>
          );
          return (<>
            {bandaEjemplo}
            {selectorMes}
            <div style={{ background: `${C.acc}10`, border: `1px solid ${C.acc}30`, borderRadius: 18, padding: 18, marginBottom: 12, boxShadow: `0 4px 18px ${C.acc}14` }} aria-label="Resumen de la flota">
              <div style={{ fontSize: 32, fontWeight: 900, color: C.accDim }}>{fmt(t.fact)}</div>
              <div style={{ fontSize: 13, color: C.t2, marginTop: 4 }}>Facturado por la flota · {conDatos.length} de {conductores.length} {conductores.length === 1 ? "conductor" : "conductores"} · {t.dias} {t.dias === 1 ? "jornada" : "jornadas"}</div>
              <div style={{ display: "flex", gap: 7, marginTop: 12 }}>
                <div style={fichaNum}><div style={fichaTit}>Empresa</div><div style={{ ...fichaVal, color: C.accDim }}>{corto(t.empresa)}</div></div>
                <div style={fichaNum}><div style={fichaTit}>Ya cobrado</div><div style={fichaVal}>{corto(t.cobrado)}</div></div>
                <div style={fichaNum}><div style={fichaTit}>Conductores</div><div style={fichaVal}>{corto(t.fact - t.empresa)}</div></div>
              </div>
              {(teDeben.length > 0 || debes.length > 0 || gCoches > 0) && <div style={{ fontSize: 12.5, color: C.t2, marginTop: 10, lineHeight: 1.6 }}>
                {teDeben.length > 0 && <div><span style={{ color: C.green, fontWeight: 800 }}>Te deben {fmt(sumaTeDeben)}</span> · {teDeben.length} {teDeben.length === 1 ? "conductor" : "conductores"}</div>}
                {debes.length > 0 && <div><span style={{ color: C.red, fontWeight: 800 }}>Debes {fmt(sumaDebes)}</span> · {debes.length} {debes.length === 1 ? "conductor" : "conductores"}</div>}
                {gCoches > 0 && <div>Gastos de los coches <span style={{ color: C.red, fontWeight: 800 }}>−{fmt(gCoches)}</span> · a la empresa le quedan <strong style={{ color: C.t1 }}>{fmt(t.empresa - gCoches)}</strong></div>}
              </div>}
            </div>
            <div style={{ ...card, padding: "8px 16px", marginBottom: 12 }} aria-label="Conductores">
              <div style={{ ...tit, padding: "8px 0 4px" }}>Conductores</div>
              {orden.map(({ c, m }) => (
                <button key={c.id} className="nb" onClick={() => abrir(c.id)} aria-label={`Ver a ${c.nombre}`} style={{ width: "100%", display: "flex", alignItems: "center", gap: 11, padding: "11px 0", background: "none", border: "none", borderTop: `1px solid ${C.linea}`, cursor: "pointer", fontFamily: "inherit", color: C.t1, textAlign: "left" }}>
                  <span style={{ width: 38, height: 38, borderRadius: 12, background: `${C.acc}22`, color: C.accDim, fontWeight: 900, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{inicial(c.nombre)}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 14, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.nombre}</span>
                    <span style={{ display: "block", fontSize: 11.5, color: C.t3, marginTop: 1 }}>{acuerdoTxt(c.acuerdo)}{m.diasTrabajados ? ` · ${m.diasTrabajados} ${m.diasTrabajados === 1 ? "día" : "días"}` : ""}</span>
                  </span>
                  {m.totalFact > 0
                    ? <span style={{ textAlign: "right", flexShrink: 0 }}><span style={{ display: "block", fontSize: 14, fontWeight: 900, whiteSpace: "nowrap" }}>{fmt(m.totalFact)}</span><span style={{ display: "block", fontSize: 11.5, fontWeight: 800, color: saldoCol(m.saldo), whiteSpace: "nowrap", marginTop: 1 }}>{saldoTxt(m.saldo)}</span></span>
                    : <span style={{ fontSize: 12, color: C.t3, flexShrink: 0 }}>Sin datos</span>}
                  <span style={{ color: C.t3, fontSize: 17, flexShrink: 0 }}>›</span>
                </button>
              ))}
            </div>
            <button className="saveBtn" onClick={nuevaFicha} style={principal}>Dar de alta un conductor</button>
          </>);
        })()}
        {vista === "conductor" && sel && (() => {
          const m = cuentasMes(sel, mes);
          const etiqueta = sel.acuerdo.modo === "fijo" ? "Suyo día" : `${num(sel.acuerdo.pctConductor)}% día`;
          const suyos = vehiculos.filter((v) => v.conductorId === sel.id);
          return (<>
            <button className="nb" onClick={() => ir("panel")} style={volver}>‹ Flota</button>
            <div style={{ ...card, padding: 16, marginBottom: 12, display: "flex", alignItems: "center", gap: 12 }} aria-label="Ficha del conductor">
              <span style={{ width: 46, height: 46, borderRadius: 14, background: `${C.acc}22`, color: C.accDim, fontWeight: 900, fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{inicial(sel.nombre)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 17, fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sel.nombre}</div>
                <div style={{ fontSize: 12.5, color: C.t2, marginTop: 1 }}>{acuerdoTxt(sel.acuerdo)}{sel.telefono ? ` · ${sel.telefono}` : ""}</div>
                {suyos.length > 0 && <div style={{ fontSize: 12, color: C.t3, marginTop: 1 }}>{suyos.map((v) => `${v.matricula}${v.licencia ? ` · licencia ${v.licencia}` : ""}`).join(" / ")}</div>}
              </div>
              <button className="nb" onClick={() => editarFicha(sel)} style={{ ...secundario, flex: "none", padding: "8px 12px" }}>Editar</button>
            </div>
            {selectorMes}
            {m.totalFact > 0 ? <>
              <div style={{ background: `${C.acc}10`, border: `1px solid ${C.acc}30`, borderRadius: 18, padding: 18, marginBottom: 12 }} aria-label="Cuentas del conductor">
                <div style={{ fontSize: 30, fontWeight: 900, color: C.accDim }}>{fmt(m.totalFact)}</div>
                <div style={{ fontSize: 13, color: C.t2, marginTop: 4 }}>Facturado · {m.diasTrabajados} {m.diasTrabajados === 1 ? "día" : "días"} · media <strong style={{ color: C.t1 }}>{fmt0(m.mediaDiaria)}</strong> al día</div>
                <div style={{ display: "flex", gap: 7, marginTop: 12 }}>
                  <div style={fichaNum}><div style={fichaTit}>Empresa</div><div style={{ ...fichaVal, color: C.accDim }}>{corto(m.parteEmpresaMes)}</div></div>
                  <div style={fichaNum}><div style={fichaTit}>Ya cobrado</div><div style={fichaVal}>{corto(m.totalCobradoEmpresa)}</div></div>
                  <div style={fichaNum}><div style={fichaTit}>Su efectivo</div><div style={{ ...fichaVal, color: C.blue }}>{corto(m.efectivoMes)}</div></div>
                </div>
              </div>
              <div style={{ background: `${saldoCol(m.saldo)}14`, border: `1.5px solid ${saldoCol(m.saldo)}44`, borderRadius: 16, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }} aria-label="Saldo con el conductor">
                <div><div style={{ fontSize: 12, color: C.t2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>{Math.abs(m.saldo) < 0.005 ? "Estáis en paz" : m.saldo > 0 ? "Te debe el conductor" : "Le debes al conductor"}</div><div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>{m.porMes && mes >= mesHoy ? "Mes en curso: aún puede cubrir la cuota" : m.gastos.reembolsable > 0 ? "Incluye los gastos que le devuelves" : "Saldo del mes"}</div></div>
                <div style={{ fontSize: 24, fontWeight: 900, color: saldoCol(m.saldo), marginLeft: 14, whiteSpace: "nowrap" }}>{fmt(Math.abs(m.saldo))}</div>
              </div>
            </> : <div style={{ ...card, padding: 20, textAlign: "center", color: C.t2, fontSize: 13.5, marginBottom: 12 }}>Sin cuentas en {monthLabel(mes)}.</div>}
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <button className="nb" onClick={() => abrirDia(sel, mes === mesHoy ? todayStr() : `${mes}-01`)} style={dorado}>Apuntar un día</button>
              {m.totalFact > 0 && <button className="nb" onClick={() => informeConductor(sel)} style={secundario}>Informe en PDF</button>}
            </div>
            {aviso && <div role="status" style={{ fontSize: 12.5, color: C.t2, fontWeight: 700, margin: "-4px 0 12px" }}>{aviso}</div>}
            {m.totalFact > 0 && <>
              <Desglose entries={m.entries} plats={sel.plataformas} etiqueta={`${sel.nombre} · ${capitalizar(monthLabel(mes))}`} boton="Copiar el desglose" />
              <DayTable rows={m.rows} etiqueta={etiqueta} mensual={m.porMes} empresa />
            </>}
            <div style={{ ...card, padding: 16, marginBottom: 12 }} aria-label="Vincular al conductor">
              <div style={{ ...tit, marginBottom: 6 }}>Su TXpro</div>
              <div style={{ fontSize: 12.5, color: C.t2, lineHeight: 1.5, marginBottom: 10 }}>Mándale la invitación: al aceptarla en su móvil queda en tu flota con este acuerdo (<strong style={{ color: C.t1 }}>{acuerdoTxt(sel.acuerdo).toLowerCase()}</strong>) y no podrá cambiarlo. Si cambias el acuerdo, mándale una invitación nueva.</div>
              <button className="nb" onClick={() => invitar(sel)} style={{ ...dorado, display: "block", width: "100%" }}>Enviar invitación</button>
              {enlace && <div aria-label="Enlace de invitación" style={{ marginTop: 9, padding: "8px 10px", borderRadius: 9, background: C.inp, border: `1px solid ${C.border}`, fontSize: 11, color: C.t2, wordBreak: "break-all", userSelect: "all" }}>{enlace}</div>}
              <div style={{ borderTop: `1px solid ${C.linea}`, margin: "12px 0 10px" }} />
              <div style={{ fontSize: 12.5, color: C.t2, lineHeight: 1.5, marginBottom: 10 }}>{sel.actualizado ? <>Cuentas actualizadas el <strong style={{ color: C.t1 }}>{new Date(sel.actualizado).toLocaleDateString("es-ES")}</strong>. </> : null}Para traer lo que apunta él, que te mande su copia (Ajustes → Copia de seguridad) y la cargas aquí. Con las cuentas en la nube llegarán solas.</div>
              <label className="nb" style={{ ...secundario, display: "block", textAlign: "center" }}>
                Cargar la copia del conductor
                <input type="file" accept="application/json,.json" aria-label="Copia del conductor" style={{ display: "none" }} onChange={(e) => { cargarCuentas(sel, e.target.files && e.target.files[0]); e.target.value = ""; }} />
              </label>
            </div>
            <button className="nb" onClick={() => darDeBaja(sel)} style={{ width: "100%", padding: 11, borderRadius: 10, border: `1px solid ${C.red}44`, background: `${C.red}0e`, color: C.red, fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Dar de baja</button>
          </>);
        })()}
        {vista === "dia" && sel && (() => {
          const activas = sel.plataformas.filter((p) => p.activa || Number(diaForm.v[p.key]) > 0);
          const pon = (k, val) => setDiaForm((f) => ({ ...f, v: { ...f.v, [k]: val.replace(/[^0-9.,+\-]/g, "") } }));
          const crudo = {}; for (const k of clavesDia(sel.plataformas)) crudo[k] = Math.max(0, evalSuma(diaForm.v[k]));
          const a = sel.acuerdo; const fijo = a.modo === "fijo"; const pm = fijo && a.cuotaPor === "mes";
          const s = calcDay(crudo, fijo ? { cuotaDia: pm ? 0 : num(a.cuota) } : num(a.pctConductor), sel.plataformas);
          const casilla = (k, etiqueta, estilo) => <input className="inp" type="text" inputMode="decimal" autoComplete="off" placeholder="0.00" aria-label={etiqueta} style={{ ...inp, width: 84, flexShrink: 0, padding: "9px 10px", fontSize: 14, textAlign: "right", ...estilo }} value={diaForm.v[k] || ""} onChange={(e) => pon(k, e.target.value)} />;
          const filas = [{ key: "taximetro", nombre: "Taxímetro" }, ...activas.map((p) => ({ key: p.key, cobKey: p.cobKey, nombre: p.nombre, cobrado: p.tipo === "cobrado" })), { key: "visa", nombre: "Tarjeta", nota: "Cierre del datáfono" }];
          const cab = { fontSize: 9.5, fontWeight: 800, color: C.t3, letterSpacing: 0.4, textTransform: "uppercase", textAlign: "right", flexShrink: 0, width: 84 };
          return (<>
            <button className="nb" onClick={() => ir("conductor")} style={volver}>‹ {sel.nombre}</button>
            <div style={{ fontSize: 17, fontWeight: 900, marginBottom: 12 }}>Apuntar o corregir un día</div>
            <div style={{ ...card, padding: 16, marginBottom: 12 }}>
              <label htmlFor="dFecha" style={etq}>Día</label>
              <input id="dFecha" className="inp" type="date" max={todayStr()} style={inp} value={diaForm.fecha} onChange={(e) => e.target.value && setDiaForm({ fecha: e.target.value, v: valoresDia(sel, e.target.value) })} />
              {sel.days[diaForm.fecha] && <div style={{ fontSize: 11.5, color: C.t3, marginTop: 6 }}>Este día ya tiene cuentas: las que guardes sustituyen a las que había.</div>}
            </div>
            <div style={{ ...card, padding: "12px 16px", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, paddingBottom: 8 }}><div style={{ ...tit, flex: 1 }}>Ingresos del día</div><div style={cab}>Facturado</div><div style={{ ...cab, color: C.blue }}>Efectivo</div></div>
              {filas.map((f) => (
                <div key={f.key} style={{ display: "flex", alignItems: "center", gap: 7, borderTop: `1px solid ${C.linea}`, padding: "9px 0" }}>
                  <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13.5, fontWeight: 800 }}>{f.nombre}</div>{f.cobrado && <div style={{ fontSize: 9.5, fontWeight: 700, color: C.green, marginTop: 2 }}>2ª casilla: ya cobrado</div>}{f.nota && <div style={{ fontSize: 10, color: C.t3, marginTop: 2 }}>{f.nota}</div>}</div>
                  {casilla(f.key, f.nombre)}
                  {f.cobKey ? casilla(f.cobKey, `${f.nombre}, ${f.cobrado ? "ya cobrado" : "cobrado en efectivo"}`, { background: f.cobrado ? `${C.green}0d` : `${C.blue}0d`, borderColor: f.cobrado ? `${C.green}38` : `${C.blue}38` }) : <div style={{ width: 84, flexShrink: 0 }} />}
                </div>
              ))}
            </div>
            <div style={{ ...card, padding: "12px 16px", marginBottom: 12, fontSize: 13, color: C.t2, lineHeight: 1.7 }} aria-label="Cuenta del día">
              Facturado <strong style={{ color: C.t1 }}>{fmt(s.facturacion)}</strong> · efectivo del conductor <strong style={{ color: C.blue }}>{fmt(s.facturacion - s.cobradoEmpresa)}</strong>
              {!pm && s.facturacion > 0 && <div style={{ fontWeight: 800, color: saldoCol(s.diferencia) }}>{saldoTxt(s.diferencia)}</div>}
            </div>
            <button className="saveBtn" onClick={guardarDia} style={principal}>Guardar el día</button>
          </>);
        })()}
        {vista === "ficha" && (() => {
          const fijo = ficha.modo === "fijo"; const porMes = ficha.cuotaPor === "mes"; const pon = (k, v) => setFicha((f) => ({ ...f, [k]: v }));
          return (<>
            <button className="nb" onClick={() => (ficha.id ? abrir(ficha.id) : ir("panel"))} style={volver}>‹ Volver</button>
            <div style={{ fontSize: 17, fontWeight: 900, marginBottom: 12 }}>{ficha.id ? "Editar conductor" : "Dar de alta un conductor"}</div>
            <div style={{ ...card, padding: 16, marginBottom: 12 }}>
              <label htmlFor="fNombre" style={etq}>Nombre</label>
              <input id="fNombre" className="inp" type="text" autoComplete="off" placeholder="Nombre y apellidos" style={{ ...inp, marginBottom: 12 }} value={ficha.nombre} onChange={(e) => pon("nombre", e.target.value)} />
              <label htmlFor="fTel" style={etq}>Teléfono (opcional)</label>
              <input id="fTel" className="inp" type="tel" autoComplete="off" placeholder="600 000 000" style={inp} value={ficha.telefono} onChange={(e) => pon("telefono", e.target.value)} />
            </div>
            <div style={{ ...card, padding: 16, marginBottom: 12 }}>
              <div style={{ ...tit, marginBottom: 12 }}>Su acuerdo con la empresa</div>
              <div style={{ display: "flex", gap: 7, marginBottom: 14 }}>
                {[["porcentaje", "A porcentaje"], ["fijo", "Cuota fija (alquiler)"]].map(([v, lb]) => <button key={v} className="nb" aria-pressed={(fijo ? "fijo" : "porcentaje") === v} onClick={() => pon("modo", v)} style={seg((fijo ? "fijo" : "porcentaje") === v)}>{lb}</button>)}
              </div>
              {fijo ? <>
                <div style={{ display: "flex", gap: 7, marginBottom: 12 }}>
                  {[["dia", "Por día trabajado"], ["mes", "Al mes"]].map(([v, lb]) => <button key={v} className="nb" aria-pressed={(porMes ? "mes" : "dia") === v} onClick={() => pon("cuotaPor", v)} style={seg((porMes ? "mes" : "dia") === v)}>{lb}</button>)}
                </div>
                <label htmlFor="fCuota" style={etq}>{porMes ? "Cuánto paga a la empresa al mes" : "Cuánto paga a la empresa por día trabajado"}</label>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}><input id="fCuota" className="inp" type="number" min="0" step={porMes ? 50 : 5} placeholder={porMes ? "2800" : "125"} style={{ ...inp, flex: 1 }} value={ficha.cuota} onChange={(e) => pon("cuota", e.target.value)} /><span style={{ fontSize: 20, fontWeight: 900, color: C.accDim }}>€</span></div>
              </> : <>
                <label htmlFor="fPct" style={etq}>Qué % de la facturación se lleva el conductor</label>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}><input id="fPct" className="inp" type="number" min="0" max="100" step="0.5" style={{ ...inp, flex: 1 }} value={ficha.pctConductor} onChange={(e) => pon("pctConductor", e.target.value)} /><span style={{ fontSize: 20, fontWeight: 900, color: C.accDim }}>%</span></div>
              </>}
              <div style={{ fontSize: 11.5, color: C.t3, marginTop: 10, lineHeight: 1.45 }}>Este acuerdo lo fijas tú: el conductor que se una a tu flota no podrá cambiarlo.</div>
            </div>
            <button className="saveBtn" disabled={!ficha.nombre.trim()} onClick={guardarFicha} style={{ ...principal, ...(ficha.nombre.trim() ? {} : apagado) }}>{ficha.id ? "Guardar cambios" : "Dar de alta"}</button>
          </>);
        })()}
        {vista === "coches" && (() => {
          const total = vehiculos.reduce((a, v) => a + gastosCocheMes(v, mes), 0);
          if (!vehiculos.length) return (
            <div style={{ ...card, padding: 22, textAlign: "center" }} aria-label="Sin coches">
              <div style={{ width: 54, height: 54, borderRadius: 16, background: `${C.acc}1c`, color: C.accDim, display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}><Icono name="coche" size={28} /></div>
              <div style={{ fontSize: 17, fontWeight: 900, marginBottom: 6 }}>Aún no tienes coches</div>
              <div style={{ fontSize: 13, color: C.t2, lineHeight: 1.5, marginBottom: 16 }}>Añade cada coche con su matrícula y su licencia, dile quién lo lleva y apunta sus gastos: seguro, taller, ITV…</div>
              <button className="saveBtn" onClick={nuevoCoche} style={principal}>Añadir un coche</button>
            </div>
          );
          return (<>
            {bandaEjemplo}
            {selectorMes}
            <div style={{ ...card, padding: "8px 16px", marginBottom: 12 }} aria-label="Coches">
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "8px 0 4px" }}><div style={tit}>Coches y licencias</div><div style={{ fontSize: 12, color: C.t2 }}>Gastos del mes: <strong style={{ color: total > 0 ? C.red : C.t3 }}>{total > 0 ? "−" : ""}{fmt(total)}</strong></div></div>
              {vehiculos.map((v) => { const g = gastosCocheMes(v, mes); return (
                <button key={v.id} className="nb" onClick={() => abrirCoche(v)} aria-label={`Ver el coche ${v.matricula}`} style={{ width: "100%", display: "flex", alignItems: "center", gap: 11, padding: "11px 0", background: "none", border: "none", borderTop: `1px solid ${C.linea}`, cursor: "pointer", fontFamily: "inherit", color: C.t1, textAlign: "left" }}>
                  <span style={{ width: 38, height: 38, borderRadius: 12, background: `${C.acc}22`, color: C.accDim, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icono name="coche" size={21} /></span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 14, fontWeight: 900, letterSpacing: 0.3 }}>{v.matricula}{v.licencia ? <span style={{ fontWeight: 600, color: C.t2, letterSpacing: 0 }}> · licencia {v.licencia}</span> : null}</span>
                    <span style={{ display: "block", fontSize: 11.5, color: C.t3, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{[v.modelo, nombreDe(v.conductorId) || "Sin conductor"].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: g > 0 ? C.red : C.t3, flexShrink: 0, whiteSpace: "nowrap" }}>{g > 0 ? `−${fmt(g)}` : "Sin gastos"}</span>
                  <span style={{ color: C.t3, fontSize: 17, flexShrink: 0 }}>›</span>
                </button>
              ); })}
            </div>
            <button className="saveBtn" onClick={nuevoCoche} style={principal}>Añadir un coche</button>
          </>);
        })()}
        {vista === "coche" && (() => {
          const pon = (k, v) => setCoche((c) => ({ ...c, [k]: v }));
          const delMes = cocheSel ? cocheSel.gastos.filter((g) => monthKey(g.date) === mes).sort((a, b) => b.date.localeCompare(a.date)) : [];
          return (<>
            <button className="nb" onClick={() => ir("coches")} style={volver}>‹ Coches</button>
            <div style={{ fontSize: 17, fontWeight: 900, marginBottom: 12 }}>{coche.id ? `Coche ${cocheSel ? cocheSel.matricula : ""}` : "Añadir un coche"}</div>
            <div style={{ ...card, padding: 16, marginBottom: 12 }}>
              <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                <label style={{ flex: 1, minWidth: 0 }}><span style={etq}>Matrícula</span><input id="vMatricula" className="inp" type="text" autoComplete="off" autoCapitalize="characters" placeholder="1234 ABC" style={{ ...inp, textTransform: "uppercase" }} value={coche.matricula} onChange={(e) => pon("matricula", e.target.value)} /></label>
                <label style={{ flex: 1, minWidth: 0 }}><span style={etq}>Nº de licencia</span><input id="vLicencia" className="inp" type="text" inputMode="numeric" autoComplete="off" placeholder="05123" style={inp} value={coche.licencia} onChange={(e) => pon("licencia", e.target.value)} /></label>
              </div>
              <label htmlFor="vModelo" style={etq}>Modelo (opcional)</label>
              <input id="vModelo" className="inp" type="text" autoComplete="off" placeholder="Toyota Corolla" style={{ ...inp, marginBottom: 12 }} value={coche.modelo} onChange={(e) => pon("modelo", e.target.value)} />
              <label htmlFor="vConductor" style={etq}>Quién lo lleva</label>
              <select id="vConductor" className="inp" style={{ ...inp, marginBottom: 14 }} value={coche.conductorId} onChange={(e) => pon("conductorId", e.target.value)}>
                <option value="">Sin conductor</option>
                {conductores.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
              <button className="saveBtn" disabled={!coche.matricula.trim()} onClick={guardarCoche} style={{ ...principal, ...(coche.matricula.trim() ? {} : apagado) }}>{coche.id ? "Guardar cambios" : "Añadir el coche"}</button>
              {aviso && <div role="status" style={{ fontSize: 12.5, color: C.green, fontWeight: 700, marginTop: 9 }}>{aviso}</div>}
            </div>
            {cocheSel && <>
              <div style={{ ...card, padding: 16, marginBottom: 12 }} aria-label="Nuevo gasto del coche">
                <div style={{ ...tit, marginBottom: 10 }}>Apuntar un gasto del coche</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                  {CONCEPTOS_COCHE.map((k) => { const on = gastoCoche.concepto === k; return <button key={k} className="nb" aria-pressed={on} onClick={() => setGastoCoche((g) => ({ ...g, concepto: k }))} style={{ padding: "7px 11px", borderRadius: 18, border: `1.5px solid ${on ? C.acc : C.border}`, background: on ? `${C.acc}18` : C.surf, color: on ? C.accDim : C.t2, fontWeight: on ? 800 : 600, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>{k}</button>; })}
                </div>
                <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                  <label style={{ flex: 1.3, minWidth: 0 }}><span style={etq}>Fecha</span><input className="inp" type="date" max={todayStr()} aria-label="Fecha del gasto" style={inp} value={gastoCoche.date} onChange={(e) => e.target.value && setGastoCoche((g) => ({ ...g, date: e.target.value }))} /></label>
                  <label style={{ flex: 1, minWidth: 0 }}><span style={etq}>Importe (€)</span><input className="inp" type="text" inputMode="decimal" autoComplete="off" placeholder="0.00" aria-label="Importe del gasto" style={{ ...inp, textAlign: "right" }} value={gastoCoche.importe} onChange={(e) => setGastoCoche((g) => ({ ...g, importe: e.target.value.replace(/[^0-9.,+\-]/g, "") }))} /></label>
                </div>
                <button className="nb" disabled={!(evalSuma(gastoCoche.importe) > 0)} onClick={anadirGastoCoche} style={{ ...dorado, display: "block", width: "100%", opacity: evalSuma(gastoCoche.importe) > 0 ? 1 : 0.5 }}>Guardar gasto</button>
              </div>
              {selectorMes}
              <div style={{ ...card, padding: "8px 16px", marginBottom: 12 }} aria-label="Gastos del coche">
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "8px 0 4px" }}><div style={tit}>Gastos del mes</div><div style={{ fontSize: 14, fontWeight: 900, color: delMes.length ? C.red : C.t3 }}>{delMes.length ? "−" : ""}{fmt(gastosCocheMes(cocheSel, mes))}</div></div>
                {delMes.length === 0 && <div style={{ fontSize: 12.5, color: C.t3, padding: "8px 0 10px" }}>Sin gastos en {monthLabel(mes)}.</div>}
                {delMes.map((g) => (
                  <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: `1px solid ${C.linea}` }}>
                    <div style={{ flex: 1 }}><div style={{ fontSize: 13.5, fontWeight: 800 }}>{g.concepto}</div><div style={{ fontSize: 11.5, color: C.t3 }}>{dayMonth(g.date)}</div></div>
                    <div style={{ fontSize: 13.5, fontWeight: 800 }}>{fmt(Number(g.importe) || 0)}</div>
                    <button className="nb" onClick={() => cambiaCoche(cocheSel.id, (v) => ({ ...v, gastos: v.gastos.filter((x) => x.id !== g.id) }))} aria-label={`Borrar ${g.concepto} de ${dayMonth(g.date)}`} style={{ background: `${C.red}14`, border: `1px solid ${C.red}33`, borderRadius: 8, padding: "5px 9px", color: C.red, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>✕</button>
                  </div>
                ))}
              </div>
              <button className="nb" onClick={() => quitarCoche(cocheSel)} style={{ width: "100%", padding: 11, borderRadius: 10, border: `1px solid ${C.red}44`, background: `${C.red}0e`, color: C.red, fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Quitar este coche</button>
            </>}
          </>);
        })()}
        {vista === "ajustes" && <>
          <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 12 }}>Ajustes de la empresa</div>
          <div style={{ ...card, padding: 16, marginBottom: 12 }}>
            <label htmlFor="eNombre" style={etq}>Nombre de la empresa o flota</label>
            <input id="eNombre" className="inp" type="text" autoComplete="off" placeholder="Taxis Ejemplo, S.L." style={inp} value={flota.empresa} onChange={(e) => setFlota((f) => ({ ...f, empresa: e.target.value.slice(0, 60) }))} />
            <div style={{ fontSize: 11.5, color: C.t3, marginTop: 8, lineHeight: 1.45 }}>Sale en las invitaciones y en los informes de tus conductores.</div>
          </div>
          <div style={{ ...card, padding: 16, marginBottom: 12 }}>
            <div style={{ ...tit, marginBottom: 8 }}>Apariencia</div>
            <SelectorTema tema={tema} elegirTema={elegirTema} />
          </div>
          <div style={{ ...card, padding: 16, marginBottom: 12 }}>
            <div style={{ ...tit, marginBottom: 8 }}>Tipo de cuenta</div>
            <div style={{ fontSize: 12.5, color: C.t2, lineHeight: 1.5, marginBottom: 12 }}>Estás usando TXpro como <strong style={{ color: C.t1 }}>empresa o flota</strong>. Si además conduces, puedes pasar a tus cuentas de conductor: la flota se queda guardada.</div>
            <button className="nb" onClick={() => alCambiarRol("conductor")} style={{ ...secundario, width: "100%" }}>Cambiar a conductor</button>
          </div>
          <div style={{ fontSize: 11.5, color: C.t3, textAlign: "center", marginTop: 16 }}>TXpro {APP_VERSION}</div>
        </>}
      </div>
      <nav style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: C.surf, borderTop: `1px solid ${C.border}`, display: "flex", zIndex: 20, boxShadow: "0 -2px 14px rgba(30,34,54,0.08)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        {[["panel", "Flota", "flota", ["conductor", "ficha", "dia"]], ["coches", "Coches", "coche", ["coche"]], ["ajustes", "Ajustes", "ajustes", []]].map(([v, lb, ic, hijas]) => { const on = vista === v || hijas.includes(vista); return (
          <button key={v} className="nb" onClick={() => ir(v)} style={{ flex: 1, padding: "12px 0 10px", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, background: "none", border: "none", borderTop: `2px solid ${on ? C.acc : "transparent"}`, cursor: "pointer", color: on ? C.accDim : C.t3, fontWeight: on ? 800 : 500, fontSize: 10, fontFamily: "inherit" }}>
            <Icono name={ic} />{lb}
          </button>
        ); })}
      </nav>
    </div>
  );
}
// LA RAÍZ: decide qué cara se enseña. Si se abre con un enlace de invitación,
// primero se enseña la invitación.
function Raiz() {
  const [rol, setRol] = useState(leerRol);
  const [vinculo, setVinculo] = useState(leerVinculo);
  const [invitacion, setInvitacion] = useState(leerInvitacion);
  const cambiar = (r) => { guardarRol(r); setRol(r); try { window.scrollTo(0, 0); } catch {} };
  const cerrarInvitacion = () => { quitarInvitacionDeLaUrl(); setInvitacion(null); };
  const aceptar = () => { const v = { ...invitacion, desde: todayStr() }; try { localStorage.setItem(VINCULO_KEY, JSON.stringify(v)); } catch {} setVinculo(v); cerrarInvitacion(); cambiar("conductor"); };
  const salirDeFlota = () => { try { localStorage.removeItem(VINCULO_KEY); } catch {} setVinculo(null); };
  if (invitacion) return <Invitacion inv={invitacion} alAceptar={aceptar} alRechazar={cerrarInvitacion} />;
  if (!rol) return <Entrada alElegir={cambiar} />;
  return rol === "empresa" ? <Flota alCambiarRol={cambiar} /> : <TXpro alCambiarRol={cambiar} vinculo={vinculo} alSalirDeFlota={salirDeFlota} />;
}
function TXpro({ alCambiarRol, vinculo, alSalirDeFlota }) {
  const [tema, elegirTema] = useTema();
  const [days, setDays] = useState(loadDays);
  const [view, setView] = useState("diario");
  const [editDate, setEditDate] = useState(today);
  // Lo que se escribe y no se ha guardado todavía, por fecha. Quien apunta viaje a
  // viaje no va a darle a "Guardar día" tras cada carrera: si se le cierra la app
  // o se reinicia el móvil, lo apuntado tiene que seguir ahí.
  const [borradores, setBorradores] = useState(() => { const b = loadStorage("tc_borradores", {}); return b && typeof b === "object" && !Array.isArray(b) ? Object.fromEntries(Object.entries(b).filter(([f, v]) => /^\d{4}-\d{2}-\d{2}$/.test(f) && v && typeof v === "object")) : {}; });
  const [form, setForm] = useState(() => { const b = loadStorage("tc_borradores", {}); if (b && b[today] && typeof b[today] === "object") return conTarjeta({ ...b[today] }); const s = loadDays(); return s[today] ? { ...s[today] } : { ...EMPTY }; });
  const [enfoque, setEnfoque] = useState(null);
  const [saved, setSaved] = useState(false);
  const [notas, setNotas] = useState(() => { const n = loadStorage("tc_notas", {}); return n && typeof n === "object" ? n : {}; });
  const [calMes, setCalMes] = useState(monthKey(today));
  const [calDia, setCalDia] = useState(today);
  const [gastos, setGastos] = useState(loadGastos);
  const [gastoForm, setGastoForm] = useState({ date: today, concepto: "Pinchazo", importe: "", reembolsable: true });
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
  // Las llegadas al aeropuerto cambian a cada rato: se piden cada vez que se
  // entra en Calendario o en su pantalla. No se guardan.
  const [llegadas, setLlegadas] = useState(null);
  useEffect(() => {
    if (view !== "calendario" && view !== "aeropuerto") return undefined;
    let vivo = true;
    fetch(LLEGADAS_URL)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((crudo) => { if (vivo) setLlegadas(limpiarLlegadas(crudo)); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [view]);
  const [mapa, setMapa] = useState(null);
  const [alcanceMapa, setAlcanceMapa] = useState(null);   // null: el día si tiene algo, si no el mes
  const [lugarMarcado, setLugarMarcado] = useState(null);
  useEffect(() => {
    if (view !== "calendario" || mapa) return;
    let vivo = true;
    fetch("./mapa-madrid.json").then((r) => (r.ok ? r.json() : null)).then((m) => { if (vivo && m && m.tierra && m.proy && Array.isArray(m.caja)) setMapa(m); }).catch(() => {});
    return () => { vivo = false; };
  }, [view, mapa]);
  const cerrarAvisoPlay = () => { setAvisarPlay(false); try { localStorage.setItem(AVISO_PLAY_KEY, JSON.stringify(Date.now())); } catch {} };
  const [avisarIOS, setAvisarIOS] = useState(tocaAvisarDeIOS);
  const [reloj, setReloj] = useState(() => relojValido(loadStorage(RELOJ_KEY, null)));
  const [ahora, setAhora] = useState(() => Date.now());
  const [avisoReloj, setAvisoReloj] = useState("");
  const [verCalculo, setVerCalculo] = useState(false);
  const [verJornada, setVerJornada] = useState(false);
  useEffect(() => { try { if (reloj) localStorage.setItem(RELOJ_KEY, JSON.stringify(reloj)); else localStorage.removeItem(RELOJ_KEY); } catch {} }, [reloj]);
  useEffect(() => { if (!reloj) return; setAhora(Date.now()); const t = setInterval(() => setAhora(Date.now()), 15000); return () => clearInterval(t); }, [reloj]);
  const cerrarAvisoIOS = () => { setAvisarIOS(false); try { localStorage.setItem(AVISO_IOS_KEY, JSON.stringify(Date.now())); } catch {} };
  useEffect(() => { const h = () => setHayUpdate(true); window.addEventListener("tc:update-ready", h); return () => window.removeEventListener("tc:update-ready", h); }, []);
  const [cfgOk, setCfgOk] = useState(() => loadStorage("tc_cfg_ok", false) === true);
  const marcarCfgOk = () => { setCfgOk(true); try { localStorage.setItem("tc_cfg_ok", "true"); } catch {} };
  // El acuerdo: el que pone el conductor en Ajustes o, si pertenece a una flota,
  // el que le fija la empresa (y entonces él no lo puede cambiar).
  const acuerdo = vinculo ? vinculo.acuerdo : cfg;
  const pct = num(acuerdo.pctConductor);
  // A porcentaje o con cuota fija (alquiler): por día trabajado o al mes.
  const fijo = acuerdo.modo === "fijo";
  const cuota = num(acuerdo.cuota);
  const porMes = fijo && acuerdo.cuotaPor === "mes";
  const rep = useMemo(() => (fijo ? { cuotaDia: porMes ? 0 : cuota } : pct), [fijo, porMes, cuota, pct]);
  const cfgInc = fijo ? { ...cfg, incentivo: "ninguno" } : cfg;
  // La parte de la cuota mensual que toca a cada día trabajado, para el "por
  // hora". En un mes ya pasado, entre los días que trabajaste; en el mes en
  // curso, entre los que vas a trabajar (tus días por semana), para que los
  // primeros días no carguen con toda la cuota.
  const cuotaPorDia = (ym, trabajados) => {
    if (!porMes) return 0;
    const [y, m] = ym.split("-").map(Number); const dt = (cfg.objetivos || {}).diasTrabajo;
    const previstos = ym >= monthKey(todayStr()) ? (new Date(y, m, 0).getDate() * (dt >= 1 && dt <= 7 ? dt : 6)) / 7 : 0;
    return cuota / Math.max(1, trabajados, previstos);
  };
  const etqParte = fijo ? "Tras la cuota" : `Tu ${pct}%`;
  const notaHora = fijo ? "lo que te queda tras la cuota" : `tu ${pct}%`;
  const etqDia = fijo ? "Tuyo día" : `${pct}% día`;
  // Las filas del reparto en las liquidaciones: el % o la cuota y lo que te queda.
  const filasReparto = (s, periodo) => {
    if (!fijo) return [{ label: `${pct}% conductor s/ facturación base`, val: s.conductorMes, color: C.accDim, bold: true }];
    const dias = s.rows.filter((r) => r.s.facturacion > 0).length;
    const etq = porMes ? (periodo ? "Cuota (parte del periodo)" : "Cuota mensual a la empresa") : `Cuota a la empresa (${fmt0(cuota)} × ${dias} ${dias === 1 ? "día" : "días"})`;
    return [{ label: etq, val: s.parteEmpresaMes, color: C.t1 }, { label: "Para ti, quitada la cuota", val: s.conductorMes, color: C.accDim, bold: true }];
  };
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
  // Mensual y Periodo eran casi la misma pantalla: ahora son una, "Resumen",
  // con un selector de mes, semana (de lunes a domingo) o fechas a elegir.
  const [modoResumen, setModoResumen] = useState("mes");
  const [anioSel, setAnioSel] = useState(() => todayStr().slice(0, 4));
  const [avisoInforme, setAvisoInforme] = useState("");
  const [rangeFrom, setRangeFrom] = useState(() => monthStart(today));
  const [rangeTo, setRangeTo] = useState(today);
  useEffect(() => { try { localStorage.setItem("tc_days", JSON.stringify(days)); } catch {} }, [days]);
  useEffect(() => { try { const limite = shiftDays(today, -60); localStorage.setItem("tc_borradores", JSON.stringify(Object.fromEntries(Object.entries(borradores).filter(([f]) => f >= limite)))); } catch {} }, [borradores]);
  useEffect(() => { try { localStorage.setItem("tc_gastos", JSON.stringify(gastos)); } catch {} }, [gastos]);
  useEffect(() => { try { localStorage.setItem("tc_notas", JSON.stringify(notas)); } catch {} }, [notas]);
  const ponerNota = (fecha, texto) => setNotas((prev) => { const next = { ...prev }; if (texto.trim()) next[fecha] = texto.slice(0, 120); else delete next[fecha]; return next; });
  useEffect(() => { try { localStorage.setItem("tc_cfg", JSON.stringify(cfg)); } catch {} }, [cfg]);
  const saveDay = () => { const parsed = {}; const conT = conTarjeta(form); for (const k of clavesDia(plats)) parsed[k] = Math.max(0, evalSuma(conT[k]));
    const prop = propinasDe(form); if (prop) parsed.propinas = prop;
    const comb = combustibleDe(form); if (comb) parsed.combustible = comb;
    const car = carrerasDe(form); if (car) parsed.carreras = car;
    if (ES_HORA.test(form.inicio || "")) parsed.inicio = form.inicio;
    if (ES_HORA.test(form.fin || "")) parsed.fin = form.fin;
    if (parsed.inicio && parsed.fin && descansoDe(form)) parsed.descanso = descansoDe(form);
    const vacio = !hasData(parsed); setDays((prev) => { const next = { ...prev }; if (vacio) delete next[editDate]; else next[editDate] = parsed; return next; }); setForm(vacio ? { ...EMPTY } : { ...parsed }); quitarBorrador(editDate); setSaved(vacio ? "borrado" : "guardado"); setTimeout(() => setSaved(false), 2000); };
  const quitarBorrador = (f) => setBorradores((b) => { if (!b[f]) return b; const n = { ...b }; delete n[f]; return n; });
  const descartarBorrador = () => { if (!window.confirm("¿Descartar lo que has apuntado sin guardar en este día?")) return; quitarBorrador(editDate); setForm(days[editDate] ? { ...days[editDate] } : { ...EMPTY }); };
  // Todo lo que teclea el conductor pasa por aquí, para que quede en el borrador.
  // Tarjeta y efectivo del taxímetro van enlazados: manda la última que se
  // escribe. Si se escribe la tarjeta, el efectivo es lo que falta; si se escribe
  // el efectivo, la tarjeta se calcula (y se recalcula al cambiar el taxímetro).
  const editar = (k, val) => {
    const n = { ...form, [k]: val };
    if (k === "visa") delete n.taxEfec;
    else if (k === "taxEfec" && String(val).trim() === "") { delete n.taxEfec; n.visa = ""; }
    else if ((k === "taxEfec" || k === "taximetro") && n.taxEfec !== undefined) { const v = tarjetaDe(n); n.visa = v > 0 ? String(v) : ""; }
    setForm(n); setBorradores((b) => ({ ...b, [editDate]: n }));
  };
  // Al salir de la casilla se hace la cuenta y queda solo el total.
  // Al salir de una casilla, su ayuda ("+ Sumar otro viaje") se quita un instante
  // después: si se quitara ya, lo de debajo subiría de golpe y el toque que
  // estaba cayendo en un botón (Guardar, desplegar…) iría a parar a otro sitio.
  const soltarEnfoque = (k) => setTimeout(() => setEnfoque((e) => (e === k ? null : e)), 160);
  const cerrarCasilla = (k) => { soltarEnfoque(k); const raw = form[k]; if (typeof raw !== "string" || !/[+\-,]/.test(raw)) return; const t = Math.max(0, evalSuma(raw)); editar(k, t > 0 ? String(t) : ""); };
  const sumarOtro = (k) => {
    const raw = String(form[k] ?? "").trim();
    if (raw && !/[+-]$/.test(raw)) editar(k, raw + "+");
    requestAnimationFrame(() => { const el = document.querySelector(`[data-casilla="${k}"]`); if (el) { el.focus(); const n = el.value.length; try { el.setSelectionRange(n, n); } catch {} } });
  };
  // Cambia un día aunque no sea el que está abierto: el cronómetro puede terminar
  // de madrugada, cuando en pantalla ya hay otra fecha.
  const ponerEnDia = (fecha, cambios) => {
    if (fecha === editDate) { const n = { ...form, ...cambios }; setForm(n); setBorradores((b) => ({ ...b, [fecha]: n })); return; }
    setBorradores((b) => ({ ...b, [fecha]: { ...(b[fecha] || days[fecha] || EMPTY), ...cambios } }));
  };
  const empezarJornada = () => {
    const t = Date.now(); const fecha = todayStr();
    const base = fecha === editDate ? form : borradores[fecha] ? conTarjeta({ ...borradores[fecha] }) : days[fecha] ? { ...days[fecha] } : { ...EMPTY };
    const n = { ...base, inicio: horaDe(t), fin: "", descanso: "" };
    setEditDate(fecha); setEnfoque(null); setForm(n); setBorradores((b) => ({ ...b, [fecha]: n }));
    setReloj({ fecha, inicio: t, pausado: 0, pausaDesde: null }); setAvisoReloj("");
  };
  const pausarJornada = () => setReloj((r) => (r && !r.pausaDesde ? { ...r, pausaDesde: Date.now() } : r));
  const seguirJornada = () => setReloj((r) => (r && r.pausaDesde ? { ...r, pausado: r.pausado + (Date.now() - r.pausaDesde), pausaDesde: null } : r));
  const terminarJornada = () => {
    if (!reloj) return; const t = Date.now();
    const pausado = reloj.pausado + (reloj.pausaDesde ? t - reloj.pausaDesde : 0);
    const descanso = Math.round(pausado / 60000);
    ponerEnDia(reloj.fecha, { inicio: horaDe(reloj.inicio), fin: horaDe(t), descanso: descanso > 0 ? descanso : "" });
    if (reloj.fecha === editDate) setVerJornada(true);  // toca apuntar carreras y propinas
    setReloj(null); setAvisoReloj(reloj.fecha === editDate ? "Jornada terminada: revisa las cifras y guarda el día." : `Jornada terminada y apuntada en el ${weekday(reloj.fecha)} ${Number(reloj.fecha.slice(8))}: ábrelo y guárdalo.`);
  };
  const cancelarReloj = () => { if (window.confirm("¿Parar el cronómetro sin apuntar la hora de terminar?")) setReloj(null); };
  const changeDate = (d) => { setEditDate(d); setEnfoque(null); setForm(borradores[d] ? conTarjeta({ ...borradores[d] }) : days[d] ? { ...days[d] } : { ...EMPTY }); };
  const jornadaHoy = useMemo(() => ({ min: minutosJornada(form), propinas: propinasDe(form), carreras: carrerasDe(form), cruza: ES_HORA.test(form.inicio || "") && ES_HORA.test(form.fin || "") && form.fin < form.inicio }), [form]);
  const dayStats = useMemo(() => { const raw = {}; const conT = conTarjeta(form); for (const k of clavesDia(plats)) raw[k] = Math.max(0, evalSuma(conT[k])); return calcDay(raw, rep, plats); }, [form, rep, plats]);
  // Con cuota mensual: lo que lleva cobrado la empresa este mes frente a la
  // cuota (saldo > 0: falta para cubrirla) y la parte de cuota que toca a cada
  // día trabajado, para el "por hora". Con lo demás, el saldo es el del día.
  const mesCuota = useMemo(() => {
    if (!porMes) return { diasMes: 0, saldo: dayStats.diferencia, cuotaDelDia: 0 };
    const otros = Object.entries(days).filter(([f]) => monthKey(f) === monthKey(editDate) && f !== editDate).map(([, d]) => calcDay(d, rep, plats)).filter((x) => x.facturacion > 0);
    const diasMes = otros.length + (dayStats.facturacion > 0 ? 1 : 0);
    return { diasMes, saldo: cuota - otros.reduce((a, x) => a + x.cobradoEmpresa, 0) - dayStats.cobradoEmpresa, cuotaDelDia: dayStats.facturacion > 0 ? cuotaPorDia(monthKey(editDate), diasMes) : 0 };
  }, [porMes, cuota, cfg, days, editDate, dayStats, rep, plats]);
  // Facturación de cada día contando lo guardado, lo apuntado sin guardar y lo que
  // se está escribiendo ahora mismo: los anillos se llenan viaje a viaje.
  const factVivo = useMemo(() => {
    const factDe = (d0) => { const raw = {}; const d = conTarjeta(d0); for (const k of clavesDia(plats)) raw[k] = Math.max(0, evalSuma(d && d[k])); return calcDay(raw, rep, plats).facturacion; };
    const mapa = {};
    for (const [f, d] of Object.entries(days)) mapa[f] = factDe(d);
    for (const [f, d] of Object.entries(borradores)) mapa[f] = factDe(d);
    mapa[editDate] = dayStats.facturacion;
    return mapa;
  }, [days, borradores, editDate, dayStats, rep, plats]);
  const ponerObjetivo = (k, v) => setCfg((c) => ({ ...c, objetivos: { ...(c.objetivos || {}), [k]: v } }));
  const saveGasto = () => { const importe = parseFloat(gastoForm.importe) || 0; if (!importe) return; setGastos((prev) => [...prev, { id: Date.now(), date: gastoForm.date, concepto: gastoForm.concepto.trim() || "Otros", importe, reembolsable: !!gastoForm.reembolsable }]); setGastoForm((f) => ({ ...f, importe: "" })); setGastoSaved(true); setTimeout(() => setGastoSaved(false), 2000); };
  const borrarGasto = (id) => setGastos((prev) => prev.filter((g) => g.id !== id));
  const months = useMemo(() => [...new Set(Object.keys(days).map(monthKey))].sort().reverse(), [days]);
  const monthData = useMemo(() => months.map((ym) => { const entries = Object.entries(days).filter(([d]) => monthKey(d) === ym).sort(([a], [b]) => a.localeCompare(b)); const g = gastosEntre(gastos, days, ym + "-01", finDeMes(ym)); const s = summarize(entries, rep, plats, porMes ? cuota : 0, porMes ? cuotaPorDia(ym, entries.length) : null); return { ym, ...s, gastos: g, combustibleMes: g.combustible, diferenciaMes: s.diferenciaMes - g.reembolsable, incentivo: incentivoDe(cfgInc, s.totalFact, g.combustible) }; }), [months, days, gastos, rep, porMes, cuota, cfg, plats]);
  useEffect(() => { if (months.length && !months.includes(selectedMonth)) setSelectedMonth(months[0]); }, [months]);
  const selectedData = monthData.find((m) => m.ym === selectedMonth);
  const rangeData = useMemo(() => { const lo = rangeFrom <= rangeTo ? rangeFrom : rangeTo; const hi = rangeFrom <= rangeTo ? rangeTo : rangeFrom; const g = gastosEntre(gastos, days, lo, hi); const s = summarize(Object.entries(days).filter(([d]) => d >= lo && d <= hi).sort(([a], [b]) => a.localeCompare(b)), rep, plats, porMes ? cuotaMensualEntre(cuota, lo, hi) : 0); return { ...s, gastos: g, diferenciaMes: s.diferenciaMes - g.reembolsable }; }, [days, gastos, rangeFrom, rangeTo, rep, porMes, cuota, plats]);
  const maxFact = Math.max(1, ...monthData.map((m) => m.totalFact));
  // EL INFORME DEL MES EN PDF. "Para la empresa": las cuentas con ella y nada
  // más. "Completo": además, lo que es solo del conductor (sus gastos, las
  // propinas, lo que le queda y lo que gana por hora), para él o su gestor.
  const informeDelMes = async (completo) => {
    const m = selectedData; if (!m || avisoInforme === "Preparando el informe…") return;
    setAvisoInforme("Preparando el informe…");
    let fin = "";
    try {
      const d = desgloseDe(Object.entries(days).filter(([f]) => monthKey(f) === m.ym), plats);
      const propios = m.gastos.total - m.gastos.reembolsable;
      const limpio = m.conductorMes + m.jornada.propinas + m.incentivo.importe - propios;
      const enCurso = porMes && m.ym >= monthKey(todayStr());
      const dif = m.diferenciaMes; const j = m.jornada;
      const balance = Math.abs(dif) < 0.005 ? null : dif < 0 ? { label: "La empresa debe al conductor", val: fmt(-dif), color: "verde" } : enCurso ? { label: "Faltan para cubrir la cuota del mes", val: fmt(dif), color: "oro" } : { label: "El conductor debe a la empresa", val: fmt(dif), color: "rojo" };
      if (balance && m.gastos.reembolsable > 0) balance.sub = "Incluye los gastos que devuelve la empresa";
      const parte = { label: fijo ? "Conductor, tras la cuota" : `Conductor (${pct}%)`, val: fmt(m.conductorMes), color: m.conductorMes < 0 ? "rojo" : "" };
      const suma = [j.propinas > 0 ? `${fmt(j.propinas)} de propinas` : null, m.incentivo.importe > 0 ? `${fmt(m.incentivo.importe)} de extra` : null].filter(Boolean);
      const inf = {
        titulo: `Informe de ${monthLabel(m.ym)}`, sub: `${completo ? "Informe completo" : "Liquidación con la empresa"} · generado el ${new Date().toLocaleDateString("es-ES")}`,
        total: fmt(m.totalFact), totalSub: `Facturado · ${m.diasTrabajados} ${m.diasTrabajados === 1 ? "día" : "días"} · media ${fmt0(m.mediaDiaria)} al día`,
        fichas: completo
          ? [parte, { label: "Gastos del conductor", val: (propios > 0 ? "−" : "") + fmt(propios), color: propios > 0 ? "rojo" : "" }, { label: "Le queda", val: fmt(limpio), color: limpio >= 0 ? "verde" : "rojo", destacada: true }]
          : [parte, { label: "Cobrado por la empresa", val: fmt(m.totalCobradoEmpresa) }, { label: "Efectivo del conductor", val: fmt(m.efectivoMes) }],
        nota: completo && suma.length ? `«Le queda» incluye ${suma.join(" y ")}.` : "",
        balance,
        desglose: { filas: d.filas.map((f) => ({ nombre: f.nombre, fact: fmt(f.fact), efec: fmt(f.efec) })), tarjeta: d.tarjeta ? fmt(d.tarjeta) : "", totalFact: fmt(d.totalFact), totalEfec: fmt(d.totalEfec) },
        liquidacionTitulo: "Liquidación del mes",
        liquidacion: [...filasReparto(m, false).map((f) => ({ label: f.label, val: fmt(f.val), fuerte: !!f.bold, color: f.bold ? "oro" : "" })), { label: "Cobrado por la empresa (apps y tarjeta)", val: fmt(m.totalCobradoEmpresa) }, { label: "Efectivo cobrado por el conductor", val: fmt(m.efectivoMes), color: "azul" }, ...(m.gastos.reembolsable > 0 ? [{ label: "Gastos que devuelve la empresa", val: fmt(m.gastos.reembolsable), color: "verde" }] : []), ...(m.incentivo.importe > 0 ? [{ label: m.incentivo.etiqueta, val: fmt(m.incentivo.importe), color: "verde" }] : [])],
        jornada: !completo ? [] : [...(j.min ? [{ label: `Horas trabajadas (${j.diasConHoras} ${j.diasConHoras === 1 ? "día" : "días"})`, val: duracion(j.min) }] : []), ...(j.carreras ? [{ label: "Carreras", val: String(j.carreras) }] : []), ...(j.propinas ? [{ label: "Propinas", val: fmt(j.propinas) }] : []), ...(j.min ? [{ label: "Gana por hora", val: `${fmt(j.ganadoConHoras / (j.min / 60))}/h`, fuerte: true }] : [])],
        gastos: [...(completo && m.gastos.combustible > 0 ? [{ label: "Combustible", val: "−" + fmt(m.gastos.combustible) }] : []), ...gastos.filter((g) => monthKey(g.date) === m.ym && g.concepto !== "Combustible" && (completo || g.reembolsable)).sort((a, b) => a.date.localeCompare(b.date)).map((g) => ({ label: `${g.concepto} · ${dayMonth(g.date)}${g.reembolsable ? " · lo devuelve la empresa" : ""}`, val: "−" + fmt(Number(g.importe) || 0) }))],
        dias: porMes
          ? { cols: ["Fecha", "Facturado", "Cobró empresa", "Efectivo"], filas: m.rows.map((r) => [`${weekday(r.date)} ${dayMonth(r.date)}`, fmt(r.s.facturacion), fmt(r.s.cobradoEmpresa), fmt(r.s.facturacion - r.s.cobradoEmpresa)]) }
          : { cols: ["Fecha", "Facturado", "Cobró empresa", "Efectivo", fijo ? "Conductor" : `${pct}% día`, "Diferencia"], filas: m.rows.map((r) => [`${weekday(r.date)} ${dayMonth(r.date)}`, fmt(r.s.facturacion), fmt(r.s.cobradoEmpresa), fmt(r.s.facturacion - r.s.cobradoEmpresa), fmt(r.s.conductor50), { v: (r.s.diferencia <= 0 ? "−" : "+") + fmt(Math.abs(r.s.diferencia)), color: r.s.diferencia <= 0 ? "verde" : "rojo" }]) },
      };
      const como = await entregarArchivo(await crearInformePDF(inf), `TXpro-${m.ym}${completo ? "-completo" : ""}.pdf`, inf.titulo);
      fin = como === "descargado" ? "Informe descargado" : "";
    } catch { fin = "No se pudo crear el informe en este móvil"; }
    setAvisoInforme(fin); if (fin) setTimeout(() => setAvisoInforme(""), 3000);
  };
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
  const casilla = (k, etiqueta, estilo, pista, valor) => (
    <input className="inp" type="text" inputMode="decimal" enterKeyHint="done" autoComplete="off" placeholder={pista || "0.00"} data-casilla={k} aria-label={etiqueta}
      style={{ ...inp, width: ANCHO, flexShrink: 0, padding: "9px 10px", fontSize: 14, textAlign: "right", ...estilo }}
      value={valor !== undefined ? valor : form[k] || ""} onFocus={() => setEnfoque(k)} onBlur={() => cerrarCasilla(k)}
      onChange={(e) => editar(k, limpiarCasilla(e.target.value))}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
  );
  // Debajo de la casilla que se está escribiendo: el botón de sumar otro viaje
  // (no todos los teclados numéricos tienen "+") y la cuenta en vivo. El
  // onMouseDown evita que el botón le quite el foco a la casilla y cierre el teclado.
  const ayudaSuma = (k, que = "viaje") => {
    const raw = String(form[k] ?? "");
    const hayCuenta = /\d[+-]\d/.test(raw.replace(/,/g, "."));
    return (
      <div style={{ padding: "0 0 10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <button type="button" className="nb" onMouseDown={(e) => e.preventDefault()} onClick={() => sumarOtro(k)} style={{ padding: "7px 11px", borderRadius: 9, border: `1px solid ${C.acc}66`, background: `${C.acc}14`, color: C.accDim, fontWeight: 800, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>+ Sumar otro {que}</button>
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
    { key: "taximetro", cobKey: "taxEfec", nombre: "Taxímetro", oro: true },
    ...platsActivas.map((pl) => ({ key: pl.key, cobKey: pl.cobKey, nombre: pl.nombre, cobrado: pl.tipo === "cobrado" })),
    // La tarjeta es el cierre del datáfono entero: taxímetro y también los viajes
    // de las apps que se cobran por fuera con tarjeta. Por eso va al final.
    { key: "visa", nombre: "Tarjeta", nota: "Cierre del datáfono. Lo que no pongas aquí cuenta como efectivo." },
  ];
  const colHead = { fontSize: 9.5, fontWeight: 800, color: C.t3, letterSpacing: 0.4, textTransform: "uppercase", textAlign: "right", flexShrink: 0 };
  const inp = { width: "100%", background: C.inp, border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "11px 12px", color: C.t1, fontSize: 15, fontWeight: 700, fontFamily: "inherit" };
  return (
    <div style={{ maxWidth: 480, margin: "0 auto", minHeight: "100vh", background: C.bg, color: C.t1, fontFamily: "'DM Sans', sans-serif", paddingBottom: "calc(80px + env(safe-area-inset-bottom, 0px))" }}>
      <div style={{ background: `linear-gradient(180deg, ${C.surf}, ${C.cabecera})`, borderBottom: `2px solid ${C.acc}40`, padding: "9px 16px 8px", paddingTop: "calc(9px + env(safe-area-inset-top, 0px))", position: "sticky", top: 0, zIndex: 10, boxShadow: "0 2px 14px rgba(30,34,54,0.08)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <TXLogo size={36} />
          <div style={{ flex: 1, fontSize: 19, fontWeight: 900, letterSpacing: -0.5, color: C.t1 }}>TX<span style={{ color: C.accDim }}>pro</span></div>
          <button className="nb" onClick={() => setView(view === "ajustes" ? "diario" : "ajustes")} aria-label="Ajustes" style={{ background: view === "ajustes" ? `${C.acc}22` : C.surf, border: `1px solid ${view === "ajustes" ? C.acc : C.border}`, borderRadius: 11, width: 38, height: 38, cursor: "pointer", flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", color: view === "ajustes" ? C.accDim : C.t2 }}><Icono name="ajustes" size={19} /></button>
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
      {avisarIOS && <div style={{ margin: "16px 16px 0", background: `${C.blue}0f`, border: `1.5px solid ${C.blue}44`, borderRadius: 14, padding: 14 }}>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: C.t1, marginBottom: 4 }}>Instala TXpro en tu iPhone</div>
        <div style={{ fontSize: 12.5, color: C.t2, lineHeight: 1.5, marginBottom: 8 }}>Tendrás su icono en la pantalla de inicio, sin la barra del navegador y disponible aunque te quedes sin cobertura. Es gratis y no pasa por la App Store.</div>
        <ol style={{ margin: "0 0 10px", paddingLeft: 20, fontSize: 12.5, color: C.t1, lineHeight: 1.7 }}>
          <li>Toca el botón <strong>Compartir</strong> <IconoCompartir /> de Safari.</li>
          <li>Elige <strong>«Añadir a pantalla de inicio»</strong>.</li>
          <li>Toca <strong>Añadir</strong>.</li>
        </ol>
        <div style={{ fontSize: 11.5, color: C.t3, marginBottom: 10 }}>¿No te sale? Abre txpro.app en Safari y vuelve a probar.</div>
        <button className="nb" onClick={cerrarAvisoIOS} style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: `1px solid ${C.border}`, background: C.surf, color: C.t2, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Más tarde</button>
      </div>}
      {hayUpdate && <div style={{ margin: "16px 16px 0", background: `${C.green}14`, border: `1.5px solid ${C.green}44`, borderRadius: 14, padding: 14, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1 }}><div style={{ fontSize: 13.5, fontWeight: 800, color: C.t1 }}>Hay una versión nueva</div><div style={{ fontSize: 11.5, color: C.t2, marginTop: 2 }}>Guarda lo que tengas a medias antes de actualizar.</div></div>
        <button className="saveBtn" onClick={() => window.tcApplyUpdate && window.tcApplyUpdate()} style={{ padding: "9px 14px", borderRadius: 10, border: "none", background: C.green, color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>Actualizar</button>
      </div>}
      <div style={{ padding: 16 }}>
        {view === "diario" && <>
          {!cfgOk && !vinculo && <div style={{ background: `${C.acc}12`, border: `1.5px solid ${C.acc}44`, borderRadius: 14, padding: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.t1, marginBottom: 4 }}>Ajusta la app a tu acuerdo</div>
            <div style={{ fontSize: 12.5, color: C.t2, lineHeight: 1.5, marginBottom: 10 }}>Dinos cómo trabajas: <strong>a porcentaje</strong> (por ejemplo el 50%) o <strong>con cuota fija</strong> a la empresa, como un alquiler (por día trabajado o al mes). Hasta que lo hagas, la app calcula con el 50%.</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="saveBtn" onClick={() => setView("ajustes")} style={{ flex: 1, padding: 10, borderRadius: 10, border: "none", background: `linear-gradient(135deg,${C.acc},${C.accDim})`, color: "#0d0f14", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Configurar ahora</button>
              <button className="nb" onClick={marcarCfgOk} style={{ padding: "10px 14px", borderRadius: 10, border: `1px solid ${C.border}`, background: C.surf, color: C.t2, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Ahora no</button>
            </div>
          </div>}
          {(() => {
            // LA PANTALLA DE HOY: lo que llevas, de un vistazo, y el cronómetro.
            const esHoy = editDate === todayStr();
            const relojAqui = reloj && reloj.fecha === editDate;
            const minVivos = relojAqui ? minutosReloj(reloj, ahora) : jornadaHoy.min;
            // Con cuota mensual el saldo es del mes: lo que lleva cobrado la empresa
            // este mes frente a la cuota. Para el "por hora", la cuota se reparte
            // entre los días trabajados del mes.
            const { diasMes, saldo, cuotaDelDia } = mesCuota;
            const ganado = dayStats.conductor50 - cuotaDelDia + jornadaHoy.propinas;
            const porHora = minVivos >= 15 && ganado > 0 ? ganado / (minVivos / 60) : 0;
            const lunes = lunesDe(editDate);
            const semana = ["L", "M", "X", "J", "V", "S", "D"].map((letra, i) => { const f = shiftDays(lunes, i); return { f, letra, v: factVivo[f] || 0 }; });
            const maximo = Math.max(...semana.map((x) => x.v), 1);
            const totalSemana = semana.reduce((acc, x) => acc + x.v, 0);
            const esEstaSemana = lunesDe(todayStr()) === lunes;
            const ficha = { flex: 1, minWidth: 0, background: C.inp, border: `1px solid ${C.border}`, borderRadius: 12, padding: "9px 10px" };
            const fichaTit = { fontSize: 10.5, color: C.t3, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 3 };
            const fichaVal = { fontSize: 16, fontWeight: 900, color: C.t1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
            const boton = (principal) => ({ flex: 1, padding: 12, borderRadius: 12, border: principal ? "none" : `1px solid ${C.border}`, background: principal ? `linear-gradient(135deg,${C.acc},${C.accDim})` : C.surf, color: principal ? "#0d0f14" : C.t1, fontWeight: 900, fontSize: 14, cursor: "pointer", fontFamily: "inherit" });
            return (
              <div style={{ ...card, padding: 16, marginBottom: 12 }} aria-label="Resumen del día">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                  <label style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                    <span style={{ fontSize: 11, color: C.t2, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1 }}>{esHoy ? "Hoy" : `${weekday(editDate)} ${Number(editDate.slice(8))}/${editDate.slice(5, 7)}`}</span>
                    <span style={{ fontSize: 11.5, color: C.accDim, fontWeight: 700 }}>{esHoy ? `${weekday(editDate)} ${Number(editDate.slice(8))}/${editDate.slice(5, 7)}` : "· volver a hoy"} ▾</span>
                    <input type="date" aria-label="Fecha del día" value={editDate} onChange={(e) => e.target.value && changeDate(e.target.value)} style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", cursor: "pointer" }} />
                  </label>
                  {relojAqui && <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 9px", borderRadius: 20, background: reloj.pausaDesde ? `${C.acc}18` : `${C.green}18`, color: reloj.pausaDesde ? C.accDim : C.green, fontSize: 11.5, fontWeight: 800 }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: reloj.pausaDesde ? C.acc : C.green }} />{reloj.pausaDesde ? "En pausa" : `En jornada desde las ${horaDe(reloj.inicio)}`}</div>}
                </div>
                <div style={{ fontSize: 34, fontWeight: 900, color: C.t1, letterSpacing: -0.5, lineHeight: 1.1 }}>{fmt(dayStats.facturacion)}</div>
                <div style={{ fontSize: 12.5, color: C.t2, marginTop: 3 }}>Facturado · {porMes ? <>cuota de <strong style={{ color: C.t1 }}>{fmt0(cuota)}</strong> al mes</> : <>tu parte <strong style={{ color: C.t1 }}>{fmt(dayStats.conductor50)}</strong></>}{jornadaHoy.propinas > 0 ? <> + propinas <strong style={{ color: C.green }}>{fmt(jornadaHoy.propinas)}</strong></> : null}</div>
                {(porMes ? diasMes > 0 && cuota > 0 : dayStats.facturacion > 0) && Math.abs(saldo) >= 0.005 && (() => { const teDeben = saldo < 0; const col = teDeben ? C.green : porMes ? C.accDim : C.red; return (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 7, marginTop: 8, padding: "5px 10px", borderRadius: 20, background: teDeben ? `${C.green}14` : porMes ? `${C.acc}18` : `${C.red}12`, fontSize: 12.5, fontWeight: 800, color: col }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: col }} />{porMes ? (teDeben ? "Cuota del mes cubierta · la empresa te debe" : "Faltan para cubrir la cuota del mes") : teDeben ? "La empresa te debe" : "Debes a la empresa"} {fmt(Math.abs(saldo))}
                  </div>
                ); })()}
                {(() => { const piezas = [jornadaHoy.carreras ? `${jornadaHoy.carreras} carreras` : null, minVivos ? duracion(minVivos) : null, porHora ? `${fmt0(porHora)}/h` : null].filter(Boolean); return piezas.length ? <div style={{ fontSize: 12.5, color: C.t2, marginTop: 8, fontWeight: 600 }}>{piezas.join(" · ")}</div> : null; })()}
                {relojAqui ? <>
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    {reloj.pausaDesde
                      ? <button className="saveBtn" onClick={seguirJornada} style={boton(false)}>▶ Seguir</button>
                      : <button className="saveBtn" onClick={pausarJornada} style={boton(false)}>❚❚ Pausa</button>}
                    <button className="saveBtn" onClick={terminarJornada} style={boton(true)}>■ Terminar jornada</button>
                  </div>
                  <button className="nb" onClick={cancelarReloj} style={{ marginTop: 8, background: "none", border: "none", padding: 0, font: "inherit", fontSize: 11.5, color: C.t3, textDecoration: "underline", cursor: "pointer" }}>Parar sin apuntar</button>
                </> : reloj ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, background: `${C.green}12`, border: `1px solid ${C.green}33`, borderRadius: 10, padding: "9px 12px" }}>
                    <div style={{ flex: 1, fontSize: 12.5, color: C.t1 }}>Tienes en marcha la jornada del <strong>{weekday(reloj.fecha)} {Number(reloj.fecha.slice(8))}</strong></div>
                    <button className="nb" onClick={() => changeDate(reloj.fecha)} style={{ padding: "7px 12px", borderRadius: 9, border: `1px solid ${C.green}55`, background: C.surf, color: C.green, fontWeight: 800, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>Ver</button>
                  </div>
                ) : esHoy && !form.fin ? (
                  <button className="saveBtn" onClick={empezarJornada} style={{ ...boton(true), width: "100%", marginTop: 10, padding: 10 }}>▶ Empezar jornada</button>
                ) : null}
                {avisoReloj && <div style={{ marginTop: 10, fontSize: 12.5, color: C.green, fontWeight: 700 }}>{avisoReloj}</div>}
                <div style={{ borderTop: `1px solid ${C.linea}`, marginTop: 12, paddingTop: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                    <div style={{ fontSize: 11, color: C.t2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>{esEstaSemana ? "Esta semana" : `Semana del ${Number(lunes.slice(8))}/${lunes.slice(5, 7)}`}</div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: C.t1 }}>{fmt(totalSemana)}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
                    {semana.map((x) => { const sel = x.f === editDate; return (
                      <button key={x.f} className="nb" onClick={() => changeDate(x.f)} aria-label={`${weekday(x.f)} ${Number(x.f.slice(8))}: ${fmt(x.v)}`} aria-pressed={sel} style={{ flex: 1, background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 5, fontFamily: "inherit" }}>
                        <div style={{ width: "100%", height: 40, display: "flex", alignItems: "flex-end" }}><div style={{ width: "100%", height: Math.max(4, Math.round((x.v / maximo) * 40)), borderRadius: 6, background: x.v ? (sel ? C.acc : `${C.acc}66`) : C.linea }} /></div>
                        <span style={{ fontSize: 11, fontWeight: sel ? 900 : 700, color: sel ? C.t1 : C.t3 }}>{x.letra}</span>
                      </button>
                    ); })}
                  </div>
                </div>
              </div>
            );
          })()}
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
              <div style={{ display: "flex", alignItems: "center", gap: 7, borderTop: `1px solid ${C.linea}`, padding: "10px 0" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {f.oro && <TaxiLogo size={18} color={C.acc} />}
                    <span style={{ fontSize: 13.5, fontWeight: 800, color: f.oro ? "#c08a06" : C.t1, lineHeight: 1.2, wordBreak: "break-word" }}>{f.nombre}</span>
                  </div>
                  {f.cobrado && <div style={{ fontSize: 9.5, fontWeight: 700, color: C.green, marginTop: 3 }}>2ª casilla: ya cobrado</div>}
                  {f.nota && <div style={{ fontSize: 10, color: C.t3, marginTop: 3, lineHeight: 1.3 }}>{f.nota}</div>}
                </div>
                {casilla(f.key, f.nombre)}
                {f.cobKey
                  ? casilla(f.cobKey, `${f.nombre}, ${f.cobrado ? "ya cobrado" : "cobrado en efectivo"}`, { background: f.cobrado ? `${C.green}0d` : `${C.blue}0d`, borderColor: f.cobrado ? `${C.green}38` : `${C.blue}38` }, undefined, f.key === "taximetro" && form.taxEfec === undefined ? efectivoTaxi(form) : undefined)
                  : <div style={{ width: ANCHO, flexShrink: 0 }} />}
              </div>
              {(enfoque === f.key || enfoque === f.cobKey) && ayudaSuma(enfoque)}
              </React.Fragment>
            ))}
          </div>
          <button className="nb" onClick={() => setVerCalculo((v) => !v)} aria-expanded={verCalculo} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px", marginBottom: 12, borderRadius: 12, border: `1px solid ${C.border}`, background: C.surf, color: C.t2, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
            <span>Cálculo con la empresa</span><span>{verCalculo ? "▴" : "▾"}</span>
          </button>
          {verCalculo && <>
          <div style={{ ...card, padding: 16, marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: C.t2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Cálculo del día</div>
            {[...(porMes ? [] : fijo ? [{ label: "Cuota para la empresa", val: dayStats.parteEmpresa, color: C.t1 }, { label: "Para ti, quitada la cuota", val: dayStats.conductor50, color: C.accDim, bold: true }] : [{ label: `${pct}% conductor (sobre fact. base)`, val: dayStats.conductor50, color: C.accDim, bold: true }]), { label: "Cobrado por empresa (cobrado en apps + tarjeta)", val: dayStats.cobradoEmpresa, color: C.t2 }, { label: "Cobrado en efectivo por el conductor", val: dayStats.facturacion - dayStats.cobradoEmpresa, color: C.blue }].map(({ label, val, color, bold }, i, arr) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : "none" }}>
                <span style={{ fontSize: 13, color: C.t2 }}>{label}</span><span style={{ fontSize: bold ? 16 : 14, fontWeight: bold ? 800 : 600, color }}>{fmt(val)}</span>
              </div>
            ))}
            {porMes && <div style={{ fontSize: 11.5, color: C.t3, marginTop: 8, lineHeight: 1.45 }}>Tu cuota de {fmt0(cuota)} es mensual: se cuenta con todo lo que cobre la empresa en el mes. Lo verás en Resumen.</div>}
          </div>
          </>}
          {(() => {
            const etiqueta = { fontSize: 12, color: C.t2, fontWeight: 600, marginBottom: 5, display: "block" };
            const campo = { ...inp, padding: "10px 11px", fontSize: 15 };
            const porHora = jornadaHoy.min ? (dayStats.conductor50 - mesCuota.cuotaDelDia + jornadaHoy.propinas) / (jornadaHoy.min / 60) : 0;
            const datos = [
              jornadaHoy.min ? `${duracion(jornadaHoy.min)}${jornadaHoy.cruza ? " (pasas la medianoche)" : ""}` : null,
              porHora > 0 ? `ganas ${fmt(porHora)}/h` : null,
              jornadaHoy.carreras && dayStats.facturacion > 0 ? `${fmt(dayStats.facturacion / jornadaHoy.carreras)} por carrera` : null,
            ].filter(Boolean);
            return (
              <div style={{ ...card, padding: verJornada ? 16 : "13px 16px", marginBottom: 14 }}>
                <button className="nb" onClick={() => setVerJornada((v) => !v)} aria-expanded={verJornada} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                  <span style={{ fontSize: 11, color: C.t2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, flexShrink: 0 }}>Tu jornada</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: C.t3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textAlign: "right" }}>{verJornada ? "" : [form.inicio && form.fin ? `${form.inicio}–${form.fin}` : form.inicio ? `desde ${form.inicio}` : null, jornadaHoy.carreras ? `${jornadaHoy.carreras} carreras` : null, jornadaHoy.propinas ? `propinas ${fmt0(jornadaHoy.propinas)}` : null, combustibleDe(form) ? `combustible ${fmt0(combustibleDe(form))}` : null].filter(Boolean).join(" · ") || "horas, carreras, propinas, combustible"}</span>
                  <span style={{ color: C.t2, flexShrink: 0 }}>{verJornada ? "▴" : "▾"}</span>
                </button>
                {verJornada && <div style={{ marginTop: 12 }}>
                <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                  <label style={{ flex: 1, minWidth: 0 }}><span style={etiqueta}>Empiezas</span><input className="inp" type="time" aria-label="Hora de empezar" style={campo} value={form.inicio || ""} onChange={(e) => editar("inicio", e.target.value)} /></label>
                  <label style={{ flex: 1, minWidth: 0 }}><span style={etiqueta}>Terminas</span><input className="inp" type="time" aria-label="Hora de terminar" style={campo} value={form.fin || ""} onChange={(e) => editar("fin", e.target.value)} /></label>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <label style={{ flex: 1, minWidth: 0 }}><span style={etiqueta}>Carreras</span><input className="inp" type="number" min="0" step="1" inputMode="numeric" placeholder="0" aria-label="Número de carreras" style={{ ...campo, textAlign: "right" }} value={form.carreras || ""} onFocus={() => setEnfoque("carreras")} onBlur={() => soltarEnfoque("carreras")} onChange={(e) => editar("carreras", e.target.value.replace(/\D/g, ""))} /></label>
                  <label style={{ flex: 1, minWidth: 0 }}><span style={etiqueta}>Propinas</span>{casilla("propinas", "Propinas", { width: "100%", padding: "10px 11px", fontSize: 15 })}</label>
                </div>
                {enfoque === "propinas" && <div style={{ marginTop: 8 }}>{ayudaSuma("propinas")}</div>}
                {enfoque === "carreras" && <div style={{ marginTop: 8, paddingBottom: 2 }}><button type="button" className="nb" onMouseDown={(e) => e.preventDefault()} onClick={() => editar("carreras", String(carrerasDe(form) + 1))} style={{ padding: "7px 11px", borderRadius: 9, border: `1px solid ${C.acc}66`, background: `${C.acc}14`, color: C.accDim, fontWeight: 800, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>+1 carrera</button></div>}
                {descansoDe(form) > 0 && <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 9, fontSize: 12, color: C.t2 }}><span>Descontados <strong style={{ color: C.t1 }}>{descansoDe(form)} min</strong> de descanso</span><button type="button" className="nb" onClick={() => editar("descanso", "")} style={{ background: "none", border: "none", padding: 0, font: "inherit", fontSize: 12, color: C.t3, textDecoration: "underline", cursor: "pointer" }}>Quitar</button></div>}
                <div style={{ fontSize: 11, color: C.t3, marginTop: 9, lineHeight: 1.45 }}>Las propinas son tuyas enteras: no entran en la facturación ni en el reparto con la empresa.</div>
                <div style={{ display: "flex", gap: 10, marginTop: 10, alignItems: "flex-end" }}>
                  <label style={{ flex: 1, minWidth: 0 }}><span style={etiqueta}>Combustible</span>{casilla("combustible", "Combustible", { width: "100%", padding: "10px 11px", fontSize: 15 })}</label>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 11, color: C.t3, lineHeight: 1.4, paddingBottom: 6 }}>Lo que has repostado hoy. Se suma solo al mes y a tu bono de combustible.</div>
                </div>
                {enfoque === "combustible" && <div style={{ marginTop: 8 }}>{ayudaSuma("combustible", "repostaje")}</div>}
                {datos.length > 0 && <div style={{ marginTop: 10, background: `${C.acc}10`, border: `1px solid ${C.acc}33`, borderRadius: 10, padding: "9px 12px", fontSize: 13, fontWeight: 700, color: C.t1, lineHeight: 1.5 }}>{datos.join(" · ")}</div>}
                </div>}
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
          // La semana se corta en el mes natural: la que empezó el lunes 28 de
          // septiembre solo cuenta, en octubre, del 1 al 4. Y su objetivo se reparte
          // por los días que caen en el mes (4 de 7), para no pedir los 7 días en 4.
          const diasSemanaMes = daysBetween(ws, we).filter((f) => monthKey(f) === mk);
          const semIni = diasSemanaMes[0], semFin = diasSemanaMes[diasSemanaMes.length - 1];
          const partida = diasSemanaMes.length < 7;
          const diasTrabajo = obj.diasTrabajo >= 1 && obj.diasTrabajo <= 7 ? obj.diasTrabajo : 6;
          // Si la semana cortada tiene menos días que los que se trabaja, el objetivo se
          // reparte: 1.500 a la semana trabajando 6 días son 250 al día, y con 4 días
          // de la semana dentro del mes tocan 1.000.
          const reparto = partida && diasSemanaMes.length < diasTrabajo ? diasSemanaMes.length / diasTrabajo : 1;
          const hecho = { dia: factVivo[today] || 0, semana: suma((f) => f >= semIni && f <= semFin), mes: suma((f) => monthKey(f) === mk) };
          const total = diasEnMes(mk); const diaMes = Number(today.slice(8));
          const quedanMes = total - diaMes + 1;            // contando hoy
          const quedanTrabajo = Math.max(1, Math.round((quedanMes * (obj.diasTrabajo >= 1 && obj.diasTrabajo <= 7 ? obj.diasTrabajo : 6)) / 7));
          const quedanSemana = daysBetween(today, semFin).length;  // contando hoy, sin salir del mes
          const nombres = { dia: "Hoy", semana: partida ? `Esta semana · del ${Number(semIni.slice(8))} al ${Number(semFin.slice(8))}` : "Esta semana", mes: capitalizar(monthLabel(mk).split(" ")[0]) };
          const datos = {};
          for (const k of ["mes", "semana", "dia"]) {
            let meta = num(obj[k]);
            if (k === "semana" && reparto < 1) meta = Math.round(meta * reparto * 100) / 100;
            if (meta > 0) datos[k] = { meta, hecho: hecho[k], frac: hecho[k] / meta };
          }
          const lider = datos.mes ? "mes" : datos.semana ? "semana" : datos.dia ? "dia" : null;
          const ritmo = datos.mes ? datos.mes.meta * (diaMes / total) : 0;
          const mesPasado = Object.entries(days).filter(([f]) => monthKey(f) === mesVecino(mk, -1)).reduce((a, [, d]) => a + calcDay(d, rep, plats).facturacion, 0);
          const umbralBono = cfgInc.incentivo === "bono" ? num(cfg.umbral) : 0;
          const lineaPie = (k) => {
            const d = datos[k]; const falta = d.meta - d.hecho;
            if (falta <= 0) return <span style={{ color: C.green, fontWeight: 800 }}>✓ Superado por {fmt(-falta)}</span>;
            if (k === "mes") return quedanMes === 1
              ? <>Te faltan <strong style={{ color: C.t1 }}>{fmt(falta)}</strong> y hoy es el último día del mes</>
              : <>Te faltan <strong style={{ color: C.t1 }}>{fmt(falta)}</strong>: {fmt(falta / quedanTrabajo)} al día en los {quedanTrabajo} días de trabajo que quedan</>;
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
                    {k === "semana" && reparto < 1 && <div style={{ fontSize: 11.5, color: C.t3, marginTop: 3, paddingLeft: 18, lineHeight: 1.45 }}>Solo cuentan los días de {monthLabel(mk).split(" ")[0]}: {diasSemanaMes.length}. Trabajas {diasTrabajo} a la semana, así que el objetivo es {diasSemanaMes.length}/{diasTrabajo} de tus {fmt0(num(obj.semana))} ({fmt(num(obj.semana) / diasTrabajo)} al día).</div>}
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
              <div style={{ fontSize: 11.5, color: C.t3, marginBottom: 12, lineHeight: 1.45 }}>Taxímetro más apps, como en Resumen. Deja vacío el que no quieras usar.</div>
              {[["dia", "Cada día"], ["semana", "Cada semana"], ["mes", "Cada mes"]].map(([k, lb]) => (
                <div key={k} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0" }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: ANILLOS[k].c, flexShrink: 0 }} />
                  <label htmlFor={`obj-${k}`} style={{ ...etiqueta, flex: 1 }}>{lb}</label>
                  <input id={`obj-${k}`} className="inp" type="number" min="0" step="1" inputMode="decimal" placeholder="—" aria-label={`Objetivo ${lb.toLowerCase()}`} style={{ ...inp, width: 110, textAlign: "right", padding: "9px 10px" }} value={obj[k] || ""} onChange={(e) => ponerObjetivo(k, e.target.value)} />
                  <span style={{ fontSize: 13, color: C.t2, fontWeight: 700 }}>€</span>
                </div>
              ))}
              {(() => { const d = obj.diasTrabajo >= 1 && obj.diasTrabajo <= 7 ? obj.diasTrabajo : 6; const boton = (on) => ({ width: 34, height: 34, borderRadius: 10, border: `1px solid ${C.border}`, background: C.surf, color: on ? C.t1 : C.t3, fontSize: 18, fontWeight: 800, cursor: on ? "pointer" : "default", fontFamily: "inherit", opacity: on ? 1 : 0.4 }); return (
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0 4px", borderTop: `1px solid ${C.border}`, marginTop: 6 }}>
                  <span style={{ ...etiqueta, flex: 1 }}>Días que trabajas a la semana</span>
                  <button className="nb" aria-label="Un día menos" disabled={d <= 1} onClick={() => ponerObjetivo("diasTrabajo", d - 1)} style={boton(d > 1)}>−</button>
                  <span aria-label="Días de trabajo a la semana" style={{ minWidth: 18, textAlign: "center", fontSize: 16, fontWeight: 900, color: C.t1 }}>{d}</span>
                  <button className="nb" aria-label="Un día más" disabled={d >= 7} onClick={() => ponerObjetivo("diasTrabajo", d + 1)} style={boton(d < 7)}>+</button>
                </div>
              ); })()}
              {(mesPasado > 0 || (umbralBono > 0 && !num(obj.mes))) && <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 8, paddingTop: 10, fontSize: 12, color: C.t2, lineHeight: 1.5 }}>
                {mesPasado > 0 && <div>El mes pasado facturaste <strong style={{ color: C.t1 }}>{fmt(mesPasado)}</strong>.</div>}
                {umbralBono > 0 && !num(obj.mes) && <button className="nb" onClick={() => ponerObjetivo("mes", String(umbralBono))} style={{ marginTop: 8, padding: "8px 12px", borderRadius: 9, border: `1px solid ${C.acc}66`, background: `${C.acc}14`, color: C.accDim, fontWeight: 800, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>Usar el de tu bono ({fmt0(umbralBono)} al mes)</button>}
              </div>}
            </div>
          </>);
        })()}
        {view === "gastos" && (() => { const mesActual = monthKey(today); const ordenados = [...gastos].sort((a, b) => b.date.localeCompare(a.date)); const meses = [...new Set([...ordenados.map((g) => monthKey(g.date)), ...Object.entries(days).filter(([, d]) => combustibleDe(d) > 0).map(([f]) => monthKey(f))])].sort().reverse(); return (<>
          <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 4 }}>Gastos</div>
          <div style={{ fontSize: 12, color: C.t2, marginBottom: 14 }}>Lo que pagas tú de tu bolsillo. Marca los que te devuelve la empresa y se descontarán de lo que le debes.</div>
          {gastoSaved && <div style={{ background: `${C.green}18`, border: `1px solid ${C.green}44`, borderRadius: 10, padding: 11, color: C.green, fontWeight: 700, textAlign: "center", marginBottom: 12, fontSize: 13 }}>Gasto guardado</div>}
          <button className="nb" onClick={() => { setView("gasolineras"); setTimeout(() => { try { window.scrollTo(0, 0); } catch {} }, 0); }} style={{ ...card, width: "100%", padding: "13px 14px", marginBottom: 12, display: "flex", alignItems: "center", gap: 12, cursor: "pointer", fontFamily: "inherit", textAlign: "left", color: C.t1, borderColor: `${C.green}55` }}>
            <span style={{ width: 38, height: 38, borderRadius: 12, background: `${C.green}18`, color: C.green, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icono name="gastos" size={21} /></span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 14, fontWeight: 900 }}>Gasolineras baratas</span>
              <span style={{ display: "block", fontSize: 12, color: C.t2, marginTop: 1 }}>Los precios de hoy, cerca de ti</span>
            </span>
            <span aria-hidden="true" style={{ fontSize: 20, color: C.t3, fontWeight: 700 }}>›</span>
          </button>

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
            const sum = gastosEntre(gastos, days, m + "-01", finDeMes(m));
            return (
              <div key={m} style={{ ...card, padding: 16, marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12, gap: 8 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: C.t1 }}>{capitalizar(monthLabel(m))}{m === mesActual ? <span style={{ fontSize: 11, color: C.accDim, fontWeight: 700 }}> · en curso</span> : null}</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: C.red, whiteSpace: "nowrap" }}>−{fmt(sum.total)}</div>
                </div>
                {sum.reembolsable > 0 && <div style={{ background: `${C.green}12`, border: `1px solid ${C.green}33`, borderRadius: 10, padding: "8px 12px", marginBottom: 12, fontSize: 12.5, color: C.green, fontWeight: 700 }}>La empresa te debe {fmt(sum.reembolsable)} de estos gastos</div>}
                {sum.combustibleDiario > 0 && <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: `1px solid ${C.border}44` }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: C.t1 }}>Combustible</div>
                    <div style={{ fontSize: 11, color: C.t3 }}>Apuntado día a día en el Diario</div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: C.t1, whiteSpace: "nowrap" }}>{fmt(sum.combustibleDiario)}</div>
                  <div style={{ width: 30, flexShrink: 0 }} />
                </div>}
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
        {view === "gasolineras" && <Gasolineras alVolver={() => setView("gastos")} />}
        {view === "aeropuerto" && (llegadas
          ? <Aeropuerto llegadas={llegadas} alVolver={() => setView("calendario")} />
          : <button className="nb" onClick={() => setView("calendario")} style={{ background: "none", border: "none", padding: "2px 0", color: C.accDim, fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>‹ Calendario</button>)}

        {view === "calendario" && (() => {
          const huecos = primerDiaSemana(calMes);
          const total = diasEnMes(calMes);
          const celdas = [...Array(huecos).fill(null), ...Array.from({ length: total }, (_, i) => `${calMes}-${String(i + 1).padStart(2, "0")}`)];
          const delMes = celdas.filter(Boolean);
          const trabajados = delMes.filter((f) => days[f]).length;
          const facturado = delMes.reduce((a, f) => a + (days[f] ? calcDay(days[f], rep, plats).facturacion : 0), 0);
          const tope = Math.max(1, ...delMes.map((f) => (days[f] ? calcDay(days[f], rep, plats).facturacion : 0)));
          const sel = calDia && monthKey(calDia) === calMes ? calDia : null;
          // El botón del día o de todo el mes manda en el mapa.
          // Si no se ha tocado, se enseña el día elegido cuando tiene algo.
          const delDiaCal = sel ? (eventosPorDia[sel] || []) : [];
          const alcanceCal = alcanceMapa === "mes" || !sel ? "mes" : alcanceMapa === "dia" ? "dia" : delDiaCal.length ? "dia" : "mes";
          const datosSel = sel && days[sel] ? calcDay(days[sel], rep, plats) : null;
          const flecha = { background: C.surf, border: `1px solid ${C.border}`, borderRadius: 10, width: 36, height: 36, fontSize: 18, color: C.t2, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 };
          const hayLlegadas = llegadasVigentes(llegadas, Date.now());
          const enUnaHora = hayLlegadas ? resumenLlegadas(llegadas, Date.now()).hora.length : 0;
          return (<>
            {hayLlegadas && <button className="nb" onClick={() => { setView("aeropuerto"); setTimeout(() => { try { window.scrollTo(0, 0); } catch {} }, 0); }} style={{ ...card, width: "100%", padding: "13px 14px", marginBottom: 12, display: "flex", alignItems: "center", gap: 12, cursor: "pointer", fontFamily: "inherit", textAlign: "left", color: C.t1, borderColor: `${C.blue}55` }}>
              <span style={{ width: 38, height: 38, borderRadius: 12, background: `${C.blue}18`, color: C.blue, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icono name="avion" size={21} /></span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 14, fontWeight: 900 }}>Llegadas al aeropuerto</span>
                <span style={{ display: "block", fontSize: 12, color: C.t2, marginTop: 1 }}>{enUnaHora ? `${cuantosVuelos(enUnaHora)} en la próxima hora` : "Sin llegadas en la próxima hora"}</span>
              </span>
              <span aria-hidden="true" style={{ fontSize: 20, color: C.t3, fontWeight: 700 }}>›</span>
            </button>}
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
                  const fact = d ? calcDay(d, rep, plats).facturacion : 0;
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
                {datosSel && <div style={{ fontSize: 12.5, color: C.t2, marginBottom: 12 }}>{porMes ? <>cobró la empresa: <strong style={{ color: C.t1 }}>{fmt(datosSel.cobradoEmpresa)}</strong></> : <>{fijo ? "para ti, quitada la cuota" : `${pct}% para ti`}: <strong style={{ color: C.t1 }}>{fmt(datosSel.conductor50)}</strong></>} · efectivo: <strong style={{ color: C.blue }}>{fmt(datosSel.facturacion - datosSel.cobradoEmpresa)}</strong></div>}
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
              const conPunto = (lista) => lista.filter((e) => lugares[e.lugar]);
              const alcance = alcanceCal;
              const lista = alcance === "dia" ? delDiaCal : delMes;
              // Un punto por recinto, en el orden en que pasan las cosas.
              const porLugar = new Map();
              for (const e of [...conPunto(lista)].sort((a, b) => a.fecha.localeCompare(b.fecha) || ordenDelDia(a) - ordenDelDia(b))) {
                if (!porLugar.has(e.lugar)) porLugar.set(e.lugar, { lugar: e.lugar, lat: lugares[e.lugar][0], lon: lugares[e.lugar][1], eventos: [] });
                porLugar.get(e.lugar).eventos.push(e);
              }
              const puntos = [...porLugar.values()];
              const generales = lista.filter((e) => !lugares[e.lugar]);
              const chip = (on) => ({ padding: "6px 10px", borderRadius: 8, border: `1px solid ${on ? C.evento : C.border}`, background: on ? `${C.evento}14` : C.surf, color: on ? C.t1 : C.t2, fontWeight: on ? 800 : 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit" });
              const visibles = lugarMarcado ? puntos.filter((p) => lugarMarcado.includes(p.lugar)) : puntos;
              return (
                <div style={{ ...card, padding: 16, marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 11, color: C.t2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Dónde es</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="nb" disabled={!sel} onClick={() => { setAlcanceMapa("dia"); setLugarMarcado(null); }} style={{ ...chip(alcance === "dia"), opacity: sel ? 1 : 0.5 }}>{sel ? `${capitalizar(weekday(sel))} ${Number(sel.slice(8))}` : "Este día"}</button>
                      <button className="nb" onClick={() => { setAlcanceMapa("mes"); setLugarMarcado(null); }} style={chip(alcance === "mes")}>Todo el mes</button>
                    </div>
                  </div>
                  <MapaEventos mapa={mapa} puntos={puntos} marcado={lugarMarcado} setMarcado={setLugarMarcado} />
                  <div style={{ fontSize: 10, color: C.t3, marginTop: 6, textAlign: "right" }}>{mapa.fuente}</div>
                  {puntos.length === 0 && <div style={{ fontSize: 12.5, color: C.t2, marginTop: 10 }}>{alcance === "dia" ? "Este día no hay nada con sitio concreto." : "Este mes no hay nada con sitio concreto."}</div>}
                  {visibles.map((p) => { const n = puntos.indexOf(p) + 1; return (
                    <div key={p.lugar} onClick={() => setLugarMarcado(lugarMarcado && lugarMarcado.length === 1 && lugarMarcado[0] === p.lugar ? null : [p.lugar])} style={{ display: "flex", gap: 10, padding: "10px 0 2px", borderTop: `1px solid ${C.border}66`, marginTop: 8, cursor: "pointer" }}>
                      <span style={{ width: 22, height: 22, borderRadius: 11, background: C.evento, color: "#fff", fontWeight: 900, fontSize: 11, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{n}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: C.t1 }}>{p.lugar}</div>
                        {alcance === "dia"
                          ? p.eventos.map((e, i) => <div key={i} style={{ fontSize: 12, color: C.t2, marginTop: 2 }}>{e.titulo}{(e.salida || e.hora) ? ` · ${textoHoras(e)}` : ""}</div>)
                          : <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 5 }}>{p.eventos.map((e, i) => (
                              <button key={i} className="nb" onClick={(ev) => { ev.stopPropagation(); setCalDia(e.fecha); setAlcanceMapa("dia"); setLugarMarcado(null); }} title={e.titulo} style={{ padding: "3px 7px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.inp, fontSize: 11.5, fontWeight: 700, color: C.t1, cursor: "pointer", fontFamily: "inherit" }}>{capitalizar(weekday(e.fecha))} {Number(e.fecha.slice(8))}</button>
                            ))}</div>}
                      </div>
                    </div>
                  ); })}
                  {lugarMarcado && visibles.length < puntos.length && <button className="nb" onClick={() => setLugarMarcado(null)} style={{ marginTop: 8, background: "none", border: "none", padding: 0, font: "inherit", fontSize: 12, color: C.t2, textDecoration: "underline", cursor: "pointer" }}>Ver todos los sitios</button>}
                  {generales.length > 0 && <div style={{ fontSize: 12, color: C.t2, marginTop: 10 }}>En toda Madrid: <strong style={{ color: C.t1 }}>{[...new Set(generales.map((e) => e.titulo))].join(", ")}</strong></div>}
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
        {view === "resumen" && (() => {
          const seg = (on) => ({ flex: 1, padding: "9px 4px", borderRadius: 10, border: `1.5px solid ${on ? C.acc : C.border}`, background: on ? `${C.acc}18` : C.surf, color: on ? C.accDim : C.t2, fontWeight: on ? 800 : 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" });
          const ir = (m) => { setModoResumen(m); if (m === "semana") { const ws = weekStart(today); setRangeFrom(ws); setRangeTo(shiftDays(ws, 6)); } };
          return (
            <div style={{ display: "flex", gap: 7, marginBottom: 12 }}>
              {[["mes", "Mes"], ["semana", "Semana"], ["anio", "Año"], ["fechas", "Fechas"]].map(([m, lb]) => <button key={m} className="nb" aria-pressed={modoResumen === m} onClick={() => ir(m)} style={seg(modoResumen === m)}>{lb}</button>)}
            </div>
          );
        })()}
        {view === "resumen" && modoResumen === "mes" && <>
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
            {(() => {
              const i = months.indexOf(selectedMonth); const antes = months[i + 1], despues = months[i - 1];
              const flecha = (on) => ({ background: C.surf, border: `1px solid ${C.border}`, borderRadius: 10, width: 34, height: 34, fontSize: 17, color: C.t2, cursor: on ? "pointer" : "default", fontFamily: "inherit", flexShrink: 0, opacity: on ? 1 : 0.35 });
              const n = selectedData ? selectedData.diasTrabajados : 0;
              return (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12 }}>
                  <button className="nb" disabled={!antes} onClick={() => antes && setSelectedMonth(antes)} aria-label="Mes anterior" style={flecha(!!antes)}>‹</button>
                  <div style={{ fontSize: 15, fontWeight: 900, color: C.t1, textAlign: "center" }}>{capitalizar(monthLabel(selectedMonth))}<div style={{ fontSize: 11, color: C.t2, fontWeight: 600 }}>{n} {n === 1 ? "día trabajado" : "días trabajados"}</div></div>
                  <button className="nb" disabled={!despues} onClick={() => despues && setSelectedMonth(despues)} aria-label="Mes siguiente" style={flecha(!!despues)}>›</button>
                </div>
              );
            })()}
            {selectedData && (() => { const { rows, totalFact, conductorMes, totalCobradoEmpresa, diferenciaMes, efectivoMes, incentivo, combustibleMes, diasTrabajados, mediaDiaria, gastos: gastosMes } = selectedData; return (
              <div>
                <Hero total={totalFact} dias={diasTrabajados} media={mediaDiaria} parte={conductorMes} etiqueta={etqParte} propinas={selectedData.jornada.propinas} extra={incentivo.importe} gastos={gastosMes.total - gastosMes.reembolsable} />
                <Balance value={diferenciaMes} pendiente={porMes && selectedMonth >= monthKey(todayStr())} sub={porMes && selectedMonth >= monthKey(todayStr()) && diferenciaMes > 0 ? `Lo que le falta cobrar a la empresa para llegar a los ${fmt0(cuota)}` : gastosMes.reembolsable > 0 ? "Balance del mes · incluye los gastos a devolver" : "Balance mensual acumulado"} />
                <Desglose entries={Object.entries(days).filter(([d]) => monthKey(d) === selectedMonth)} plats={plats} etiqueta={capitalizar(monthLabel(selectedMonth))} />
                <div style={{ ...card, padding: 16, marginBottom: 12 }} aria-label="Informe en PDF">
                  <div style={{ fontSize: 11, color: C.t2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Informe del mes en PDF</div>
                  <div style={{ fontSize: 12, color: C.t3, lineHeight: 1.45, marginBottom: 10 }}>Para mandarlo por WhatsApp o guardarlo. El completo añade tus gastos, propinas y lo que te queda.</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="nb" onClick={() => informeDelMes(false)} style={{ flex: 1, padding: 10, borderRadius: 10, border: `1px solid ${C.acc}66`, background: `${C.acc}14`, color: C.accDim, fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Para la empresa</button>
                    <button className="nb" onClick={() => informeDelMes(true)} style={{ flex: 1, padding: 10, borderRadius: 10, border: `1px solid ${C.border}`, background: C.surf, color: C.t1, fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Completo</button>
                  </div>
                  {avisoInforme && <div role="status" style={{ fontSize: 12.5, color: C.t2, fontWeight: 700, marginTop: 9 }}>{avisoInforme}</div>}
                </div>
                {(() => { const ant = mesAnterior(selectedMonth); return <Reparto entries={Object.entries(days).filter(([d]) => monthKey(d) === selectedMonth)} plats={plats} previo={desgloseDe(Object.entries(days).filter(([d]) => monthKey(d) === ant), plats).totalFact} frente={new Date(Number(ant.slice(0, 4)), Number(ant.slice(5)) - 1).toLocaleDateString("es-ES", { month: "long" })} />; })()}
                <StatCard title="Liquidación mensual" items={[...filasReparto(selectedData, false), { label: "Cobrado por empresa (acumulado mes)", val: totalCobradoEmpresa, color: C.t1 }, { label: "Efectivo cobrado por el conductor", val: efectivoMes, color: C.blue }, ...(gastosMes.total > 0 ? [{ label: "Gastos del mes", val: gastosMes.total, color: C.red, neg: true }] : []), ...(cfgInc.incentivo === "combustible" && combustibleMes > 0 ? [{ label: "de ellos, combustible", val: combustibleMes, color: C.t2, neg: true }] : []), ...(gastosMes.reembolsable > 0 ? [{ label: "Gastos que te devuelve la empresa", val: gastosMes.reembolsable, color: C.green }] : []), ...(incentivo.importe > 0 ? [{ label: incentivo.etiqueta, val: incentivo.importe, color: C.green }] : [])]}>
                  {incentivo.tipo === "ninguno" ? null : incentivo.tipo === "incompleto" ? <div style={{ background: `${C.acc}08`, border: `1px solid ${C.acc}22`, borderRadius: 10, padding: "8px 12px", marginTop: 10, fontSize: 12, color: C.t2 }}>Te falta indicar tu incentivo en Ajustes</div> : incentivo.llega ? <div style={{ background: `${C.green}12`, border: `1px solid ${C.green}33`, borderRadius: 10, padding: "8px 12px", marginTop: 10, fontSize: 12, color: C.green, fontWeight: 700 }}>{incentivo.logrado}</div>
                  : <div style={{ background: `${C.acc}08`, border: `1px solid ${C.acc}22`, borderRadius: 10, padding: "8px 12px", marginTop: 10, fontSize: 12, color: C.t2 }}>{incentivo.pendiente}</div>}
                </StatCard>
                <JornadaResumen j={selectedData.jornada} nota={notaHora} />
                <DayTable rows={rows} etiqueta={etqDia} mensual={porMes} />
              </div>
            ); })()}
          </>}
        </>}
        {view === "ajustes" && (() => { const set = (k, v) => { marcarCfgOk(); setCfg((c) => ({ ...c, [k]: v })); }; const tipos = [["bono", "Bono en €"], ["combustible", "% combustible"], ["ninguno", "Ninguno"]]; const ej = incentivoDe(cfg, num(cfg.umbral), 400); return (<>
          <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 4 }}>Ajustes</div>
          <div style={{ fontSize: 12, color: C.t2, marginBottom: 14 }}>Adapta la app a lo que te paga tu empresa. Se guarda en este móvil.</div>
          {vinculo ? <div style={{ ...card, padding: 16, marginBottom: 12, borderColor: `${C.acc}66` }} aria-label="Tu flota">
            <div style={{ fontSize: 11, color: C.t2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Tu flota</div>
            <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 8 }}>{vinculo.empresa || "Tu empresa"}</div>
            <div style={{ background: `${C.acc}12`, border: `1px solid ${C.acc}33`, borderRadius: 12, padding: "10px 12px", marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: C.t3, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>Tu acuerdo</div>
              <div style={{ fontSize: 16, fontWeight: 900, color: C.accDim, marginTop: 2 }}>{acuerdoTxt(vinculo.acuerdo)}</div>
            </div>
            <div style={{ fontSize: 12.5, color: C.t2, lineHeight: 1.5, marginBottom: 12 }}>El acuerdo lo fija tu empresa y <strong style={{ color: C.t1 }}>no se puede cambiar desde aquí</strong>. Si ha cambiado, pídele una invitación nueva.</div>
            <button className="nb" onClick={() => { if (window.confirm(`¿Salir de la flota de ${vinculo.empresa || "tu empresa"}? Volverás a poner tú tu acuerdo.`)) alSalirDeFlota(); }} style={{ width: "100%", padding: 10, borderRadius: 10, border: `1px solid ${C.border}`, background: C.surf, color: C.t2, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Salir de la flota</button>
          </div> : <div style={{ ...card, padding: 16, marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: C.t2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Cómo trabajas con la empresa</div>
            <div style={{ display: "flex", gap: 7, marginBottom: 14 }}>
              {[["porcentaje", "A porcentaje"], ["fijo", "Cuota fija (alquiler)"]].map(([v, lb]) => { const on = (cfg.modo === "fijo" ? "fijo" : "porcentaje") === v; return (
                <button key={v} className="nb" aria-pressed={on} onClick={() => set("modo", v)} style={{ flex: 1, padding: "10px 4px", borderRadius: 10, border: `1.5px solid ${on ? C.acc : C.border}`, background: on ? `${C.acc}18` : C.surf, color: on ? C.accDim : C.t2, fontWeight: on ? 800 : 600, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>{lb}</button>
              ); })}
            </div>
            {fijo ? <>
              <div style={{ display: "flex", gap: 7, marginBottom: 12 }}>
                {[["dia", "Por día trabajado"], ["mes", "Al mes"]].map(([v, lb]) => { const on = (cfg.cuotaPor === "mes" ? "mes" : "dia") === v; return (
                  <button key={v} className="nb" aria-pressed={on} onClick={() => set("cuotaPor", v)} style={{ flex: 1, padding: "8px 4px", borderRadius: 10, border: `1.5px solid ${on ? C.acc : C.border}`, background: on ? `${C.acc}18` : C.surf, color: on ? C.accDim : C.t2, fontWeight: on ? 800 : 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>{lb}</button>
                ); })}
              </div>
              <label htmlFor="cfgCuota" style={{ fontSize: 12, color: C.t2, fontWeight: 600, marginBottom: 5, display: "block" }}>{porMes ? "Cuánto pagas a la empresa al mes" : "Cuánto pagas a la empresa por cada día que trabajas"}</label>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input className="inp" type="number" min="0" step={porMes ? 50 : 5} id="cfgCuota" aria-label="Cuota a la empresa" placeholder={porMes ? "2800" : "125"} style={{ ...inp, flex: 1 }} value={cfg.cuota} onChange={(e) => set("cuota", e.target.value)} />
                <span style={{ fontSize: 20, fontWeight: 900, color: C.accDim }}>€</span>
              </div>
            </> : <>
              <label htmlFor="cfgPct" style={{ fontSize: 12, color: C.t2, fontWeight: 600, marginBottom: 5, display: "block" }}>Qué % de la facturación te llevas</label>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input className="inp" type="number" min="0" max="100" step="0.5" id="cfgPct" aria-label="Porcentaje del conductor" style={{ ...inp, flex: 1 }} value={cfg.pctConductor} onChange={(e) => set("pctConductor", e.target.value)} />
                <span style={{ fontSize: 20, fontWeight: 900, color: C.accDim }}>%</span>
              </div>
            </>}
          </div>}
          {!fijo && <div style={{ ...card, padding: 16, marginBottom: 12 }}>
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
          </div>}
          <div style={{ background: `${C.acc}10`, border: `1px solid ${C.acc}30`, borderRadius: 16, padding: 16, marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: C.accDim, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Así queda tu acuerdo</div>
            {fijo ? <div style={{ fontSize: 13, color: C.t1, lineHeight: 1.6 }}>{cuota > 0 ? <>Pagas a la empresa <strong>{fmt0(cuota)}</strong> {porMes ? "al mes" : "por cada día que trabajes"}. Todo lo demás es para ti, y el combustible lo pones tú. Al hacer cuentas, la empresa se queda la cuota de lo que ha cobrado ella (apps y tarjeta) y te paga el resto; si ha cobrado menos que la cuota, le pagas tú la diferencia.</> : <>Pon cuánto pagas a la empresa para que la app haga las cuentas.</>}</div>
            : <div style={{ fontSize: 13, color: C.t1, lineHeight: 1.6 }}>Te llevas el <strong>{pct}%</strong> de todo lo que factures.{ej.tipo === "incompleto" ? <> Te falta rellenar los dos datos del incentivo para que cuente.</> : cfg.incentivo === "bono" ? <> Al pasar de <strong>{fmt0(num(cfg.umbral))}</strong> en el mes, te dan <strong>{fmt0(num(cfg.bonoImporte))}</strong> de bono.</> : cfg.incentivo === "combustible" ? <> Al pasar de <strong>{fmt0(num(cfg.umbral))}</strong> en el mes, te pagan el <strong>{num(cfg.pctCombustible)}%</strong> del combustible (con {fmt0(400)} de gasolina serían {fmt(ej.importe)}).</> : <> Sin extras por facturación.</>}</div>}
          </div>
          <div style={{ ...card, padding: 16, marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: C.t2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Con qué aplicaciones trabajas</div>
            <div style={{ fontSize: 12.5, color: C.t2, lineHeight: 1.5, marginBottom: 6 }}>Enciende solo las que uses: las demás desaparecen del parte diario. Apagar una <strong>no borra nada</strong>, lo que ya tengas apuntado sigue contando en tus meses.</div>
            {plats.map((pl) => (
              <div key={pl.key} style={{ display: "flex", alignItems: "center", gap: 10, borderTop: `1px solid ${C.linea}`, padding: "11px 0" }}>
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
              <button className="saveBtn" onClick={addPlat} disabled={!appNueva.nombre.trim()} style={{ width: "100%", padding: 11, borderRadius: 10, border: "none", background: appNueva.nombre.trim() ? `linear-gradient(135deg,${C.acc},${C.accDim})` : C.apagado, color: appNueva.nombre.trim() ? "#0d0f14" : C.t3, fontWeight: 800, fontSize: 13, cursor: appNueva.nombre.trim() ? "pointer" : "default", fontFamily: "inherit" }}>Añadir aplicación</button>
            </div>
          </div>
          <div style={{ ...card, padding: 16, marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: C.t2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Apariencia</div>
            <div style={{ fontSize: 12.5, color: C.t2, lineHeight: 1.5, marginBottom: 12 }}>En automático, la app se pone oscura cuando tu móvil está en modo oscuro.</div>
            <div role="radiogroup" aria-label="Apariencia" style={{ display: "flex", gap: 7 }}>
              {TEMAS.map(([t, etiqueta]) => (
                <button key={t} className="nb" role="radio" aria-checked={tema === t} onClick={() => elegirTema(t)} style={{ flex: 1, padding: "10px 6px", borderRadius: 10, border: `1.5px solid ${tema === t ? C.acc : C.border}`, background: tema === t ? `${C.acc}1c` : C.surf, color: tema === t ? C.accDim : C.t2, fontWeight: tema === t ? 800 : 700, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>{etiqueta}</button>
              ))}
            </div>
          </div>
          {alCambiarRol && <div style={{ ...card, padding: 16, marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: C.t2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Tipo de cuenta</div>
            <div style={{ fontSize: 12.5, color: C.t2, lineHeight: 1.5, marginBottom: 12 }}>Estás usando TXpro como <strong style={{ color: C.t1 }}>conductor</strong>. Si llevas una empresa o una flota, puedes dar de alta a tus conductores y ver las cuentas de cada uno. Tus cuentas de conductor se quedan guardadas.</div>
            <button className="nb" onClick={() => alCambiarRol("empresa")} style={{ width: "100%", padding: 10, borderRadius: 10, border: `1px solid ${C.border}`, background: C.surf, color: C.t1, fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Cambiar a empresa o flota</button>
          </div>}
          <div style={{ ...card, padding: 16, marginBottom: 12 }} aria-label="Grupo de conductores">
            <div style={{ fontSize: 11, color: C.t2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Grupo de conductores</div>
            <div style={{ fontSize: 12.5, color: C.t2, lineHeight: 1.5, marginBottom: 12 }}>Para hablar con otros compañeros que usan TXpro: dudas, avisos y trucos del día a día.</div>
            <a href={GRUPO_WHATSAPP} target="_blank" rel="noopener noreferrer" style={{ display: "block", padding: 11, borderRadius: 10, background: "#1faa59", color: "#fff", fontWeight: 800, fontSize: 13, fontFamily: "inherit", textAlign: "center", textDecoration: "none" }}>Entrar al grupo de WhatsApp</a>
            <div style={{ fontSize: 11, color: C.t3, marginTop: 8, textAlign: "center" }}>Se abre WhatsApp. En el grupo, los demás ven tu número.</div>
          </div>
          <div style={{ ...card, padding: 16, marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: C.t2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>¿Ideas o fallos?</div>
            <div style={{ fontSize: 12.5, color: C.t2, lineHeight: 1.5, marginBottom: 12 }}>TXpro la hacemos con lo que nos pedís los compañeros. Cuéntanos qué te falta, qué cambiarías o qué ha fallado.</div>
            <a className="saveBtn" href={enlaceComentarios()} style={{ display: "block", padding: 11, borderRadius: 10, background: `linear-gradient(135deg,${C.acc},${C.accDim})`, color: "#0d0f14", fontWeight: 800, fontSize: 13, fontFamily: "inherit", textAlign: "center", textDecoration: "none" }}>Enviar comentarios</a>
            <div style={{ fontSize: 11, color: C.t3, marginTop: 8, textAlign: "center" }}>Se abre tu correo hacia {CORREO_COMENTARIOS}</div>
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
        {view === "resumen" && modoResumen === "anio" && (() => {
          // EL AÑO: lo facturado y lo que queda, mes a mes, y qué días de la semana
          // rinden más. Sale de las mismas cuentas de cada mes.
          const anios = [...new Set(months.map((m) => m.slice(0, 4)))].sort().reverse();
          if (!anios.length) return <div style={{ color: C.t2, textAlign: "center", padding: 40, fontSize: 14 }}>Sin datos. Registra días primero.</div>;
          const y = anios.includes(anioSel) ? anioSel : anios[0];
          const i = anios.indexOf(y); const antes = anios[i + 1], despues = anios[i - 1];
          const meses = monthData.filter((m) => m.ym.startsWith(y)).sort((a, b) => a.ym.localeCompare(b.ym));
          const propios = (m) => m.gastos.total - m.gastos.reembolsable;
          const limpioDe = (m) => m.conductorMes + m.jornada.propinas + m.incentivo.importe - propios(m);
          const tot = meses.reduce((a, m) => ({ fact: a.fact + m.totalFact, parte: a.parte + m.conductorMes, propinas: a.propinas + m.jornada.propinas, extra: a.extra + m.incentivo.importe, gastos: a.gastos + propios(m), dias: a.dias + m.diasTrabajados }), { fact: 0, parte: 0, propinas: 0, extra: 0, gastos: 0, dias: 0 });
          const tope = Math.max(1, ...meses.map((m) => m.totalFact));
          const mejor = meses.reduce((a, m) => (!a || m.totalFact > a.totalFact ? m : a), null);
          const nombreMes = (ym) => new Date(Number(ym.slice(0, 4)), Number(ym.slice(5)) - 1).toLocaleDateString("es-ES", { month: "long" });
          const irAlMes = (ym) => { setSelectedMonth(ym); setModoResumen("mes"); };
          const diasY = meses.flatMap((m) => m.rows).filter((r) => r.s.facturacion > 0);
          const DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
          const sem = WD.map((corto, k) => { const d = diasY.filter((r) => weekday(r.date) === corto); return { letra: "LMXJVSD"[k], nombre: DIAS[k], n: d.length, media: d.length ? d.reduce((a, r) => a + r.s.facturacion, 0) / d.length : 0 }; });
          const conDatos = sem.filter((x) => x.n > 0);
          const mejorDia = conDatos.length >= 2 ? conDatos.reduce((a, x) => (x.media > a.media ? x : a)) : null;
          const topeSem = Math.max(1, ...sem.map((x) => x.media));
          const record = diasY.reduce((a, r) => (!a || r.s.facturacion > a.s.facturacion ? r : a), null);
          const flecha = (on) => ({ background: C.surf, border: `1px solid ${C.border}`, borderRadius: 10, width: 34, height: 34, fontSize: 17, color: C.t2, cursor: on ? "pointer" : "default", fontFamily: "inherit", flexShrink: 0, opacity: on ? 1 : 0.35 });
          const cab = { fontSize: 10.5, color: C.t3, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, textAlign: "right" };
          return (<>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12 }}>
              <button className="nb" disabled={!antes} onClick={() => antes && setAnioSel(antes)} aria-label="Año anterior" style={flecha(!!antes)}>‹</button>
              <div style={{ fontSize: 15, fontWeight: 900, color: C.t1, textAlign: "center" }}>{y}<div style={{ fontSize: 11, color: C.t2, fontWeight: 600 }}>{meses.length} {meses.length === 1 ? "mes" : "meses"} con datos</div></div>
              <button className="nb" disabled={!despues} onClick={() => despues && setAnioSel(despues)} aria-label="Año siguiente" style={flecha(!!despues)}>›</button>
            </div>
            <Hero total={tot.fact} dias={tot.dias} media={tot.dias ? tot.fact / tot.dias : 0} parte={tot.parte} etiqueta={etqParte} propinas={tot.propinas} extra={tot.extra} gastos={tot.gastos} />
            <div style={{ ...card, padding: 16, marginBottom: 12 }} aria-label="Mes a mes">
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: C.t2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Mes a mes</div>
                {mejor && meses.length > 1 && <div style={{ fontSize: 12, color: C.t2 }}>Mejor mes: <strong style={{ color: C.accDim, textTransform: "capitalize" }}>{nombreMes(mejor.ym)}</strong></div>}
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 92, marginBottom: 12 }}>
                {Array.from({ length: 12 }, (_, k) => { const ym = `${y}-${String(k + 1).padStart(2, "0")}`; const m = meses.find((x) => x.ym === ym); const es = mejor && m === mejor; return (
                  <div key={ym} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <div style={{ width: "100%", maxWidth: 20, height: m ? Math.max(5, (m.totalFact / tope) * 70) : 3, borderRadius: 5, background: es ? `linear-gradient(180deg,${C.acc},${C.accDim})` : m ? `${C.acc}66` : C.linea }} />
                    <div style={{ fontSize: 10, color: es ? C.accDim : C.t3, fontWeight: es ? 800 : 600 }}>{"EFMAMJJASOND"[k]}</div>
                  </div>
                ); })}
              </div>
              <div style={{ display: "flex", gap: 8, padding: "0 0 6px", borderBottom: `1px solid ${C.border}` }}>
                <div style={{ ...cab, flex: 1, textAlign: "left" }}>Mes</div><div style={{ ...cab, width: 34 }}>Días</div><div style={{ ...cab, width: 92 }}>Facturado</div><div style={{ ...cab, width: 88, color: C.green }}>Te queda</div>
              </div>
              {meses.map((m) => { const l = limpioDe(m); return (
                <button key={m.ym} className="nb" onClick={() => irAlMes(m.ym)} aria-label={`Ver ${nombreMes(m.ym)}`} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "10px 0", background: "none", border: "none", borderBottom: `1px solid ${C.linea}`, cursor: "pointer", fontFamily: "inherit", color: C.t1, textAlign: "right" }}>
                  <span style={{ flex: 1, textAlign: "left", fontSize: 13, fontWeight: 700, textTransform: "capitalize" }}>{nombreMes(m.ym)} <span style={{ color: C.t3, fontWeight: 600 }}>›</span></span>
                  <span style={{ width: 34, fontSize: 12.5, color: C.t2 }}>{m.diasTrabajados}</span>
                  <span style={{ width: 92, fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>{fmt(m.totalFact)}</span>
                  <span style={{ width: 88, fontSize: 13, fontWeight: 800, color: l >= 0 ? C.green : C.red, whiteSpace: "nowrap" }}>{fmt(l)}</span>
                </button>
              ); })}
              <div style={{ fontSize: 11, color: C.t3, marginTop: 10 }}>Toca un mes para ver su liquidación.</div>
            </div>
            {conDatos.length > 0 && <div style={{ ...card, padding: 16, marginBottom: 20 }} aria-label="Qué días rinden más">
              <div style={{ fontSize: 11, color: C.t2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Qué días rinden más</div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 7, height: 104, marginBottom: 12 }}>
                {sem.map((x) => { const es = mejorDia && x === mejorDia; return (
                  <div key={x.nombre} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <div style={{ fontSize: 10, color: es ? C.accDim : C.t3, fontWeight: 800, whiteSpace: "nowrap" }}>{x.n ? Math.round(x.media) : ""}</div>
                    <div style={{ width: "100%", maxWidth: 34, height: x.n ? Math.max(6, (x.media / topeSem) * 62) : 3, borderRadius: 7, background: es ? `linear-gradient(180deg,${C.acc},${C.accDim})` : x.n ? `${C.acc}66` : C.linea }} />
                    <div style={{ fontSize: 11, color: es ? C.t1 : C.t3, fontWeight: es ? 900 : 600 }}>{x.letra}</div>
                  </div>
                ); })}
              </div>
              {mejorDia && <div style={{ fontSize: 13, color: C.t1, lineHeight: 1.5 }}>Tu mejor día es el <strong>{mejorDia.nombre}</strong>: <strong>{fmt0(mejorDia.media)}</strong> de media ({mejorDia.n} {mejorDia.n === 1 ? "día" : "días"}).</div>}
              {record && <div style={{ fontSize: 12.5, color: C.t2, marginTop: 4 }}>Tu récord: <strong style={{ color: C.t1 }}>{fmt(record.s.facturacion)}</strong> el {weekday(record.date)} {dayMonth(record.date)}.</div>}
              <div style={{ fontSize: 11, color: C.t3, marginTop: 8 }}>Media de lo que facturas cada día de la semana en {y}.</div>
            </div>}
          </>);
        })()}
        {view === "resumen" && (modoResumen === "semana" || modoResumen === "fechas") && (() => { const lo = rangeFrom <= rangeTo ? rangeFrom : rangeTo; const hi = rangeFrom <= rangeTo ? rangeTo : rangeFrom; const { rows, totalFact, conductorMes, totalCobradoEmpresa, diferenciaMes, efectivoMes, diasTrabajados, mediaDiaria, gastos: gastosPeriodo } = rangeData; return (<>
          {modoResumen === "fechas" && <div style={{ ...card, padding: 16, marginBottom: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ minWidth: 0 }}><label htmlFor="rangoDesde" style={{ fontSize: 12, color: C.t2, fontWeight: 600, marginBottom: 5, display: "block" }}>Desde</label><input type="date" id="rangoDesde" aria-label="Desde" className="inp" style={{ ...inp, fontSize: 13 }} value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} /></div>
              <div style={{ minWidth: 0 }}><label htmlFor="rangoHasta" style={{ fontSize: 12, color: C.t2, fontWeight: 600, marginBottom: 5, display: "block" }}>Hasta</label><input type="date" id="rangoHasta" aria-label="Hasta" className="inp" style={{ ...inp, fontSize: 13 }} value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} /></div>
            </div>
          </div>}
          {(() => { const largo = daysBetween(lo, hi).length; const mover = (n) => { setRangeFrom(shiftDays(lo, n * largo)); setRangeTo(shiftDays(hi, n * largo)); }; const flecha = { background: C.surf, border: `1px solid ${C.border}`, borderRadius: 10, width: 34, height: 34, fontSize: 17, color: C.t2, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }; return (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12 }}>
              <button className="nb" onClick={() => mover(-1)} aria-label="Periodo anterior" style={flecha}>‹</button>
              <div style={{ fontSize: 14, fontWeight: 800, color: C.t1, textAlign: "center" }}>Del {dayMonth(lo)} al {dayMonth(hi)}<div style={{ fontSize: 11, color: C.t2, fontWeight: 600 }}>{diasTrabajados} {diasTrabajados === 1 ? "día trabajado" : "días trabajados"}</div></div>
              <button className="nb" onClick={() => mover(1)} aria-label="Periodo siguiente" style={flecha}>›</button>
            </div>
          ); })()}
          {diasTrabajados === 0 ? <div style={{ color: C.t2, textAlign: "center", padding: 32, fontSize: 14 }}>Sin días registrados en este periodo.</div> : <>
            <Hero total={totalFact} dias={diasTrabajados} media={mediaDiaria} parte={conductorMes} etiqueta={etqParte} propinas={rangeData.jornada.propinas} gastos={gastosPeriodo.total - gastosPeriodo.reembolsable} />
            <Balance value={diferenciaMes} sub={gastosPeriodo.reembolsable > 0 ? "Balance del periodo · incluye los gastos a devolver" : "Balance del periodo seleccionado"} />
            <Desglose entries={Object.entries(days).filter(([d]) => d >= lo && d <= hi)} plats={plats} etiqueta={`del ${dayMonth(lo)} al ${dayMonth(hi)}`} />
            {(() => { const largo = diasEntre(lo, hi) + 1; const pLo = shiftDays(lo, -largo), pHi = shiftDays(lo, -1); return <Reparto entries={Object.entries(days).filter(([d]) => d >= lo && d <= hi)} plats={plats} previo={desgloseDe(Object.entries(days).filter(([d]) => d >= pLo && d <= pHi), plats).totalFact} frente={modoResumen === "semana" ? "la semana anterior" : `los ${largo} días anteriores`} />; })()}
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
            <StatCard title="Resumen del periodo" items={[...filasReparto(rangeData, true), { label: "Cobrado por empresa (acumulado periodo)", val: totalCobradoEmpresa, color: C.t1 }, { label: "Efectivo cobrado por el conductor", val: efectivoMes, color: C.blue }, ...(gastosPeriodo.total > 0 ? [{ label: "Gastos del periodo", val: gastosPeriodo.total, color: C.red, neg: true }] : []), ...(gastosPeriodo.reembolsable > 0 ? [{ label: "Gastos que te devuelve la empresa", val: gastosPeriodo.reembolsable, color: C.green }] : [])]} />
            <JornadaResumen j={rangeData.jornada} nota={notaHora} />
            <DayTable rows={rows} etiqueta={etqDia} mensual={porMes} />
          </>}
        </>); })()}
      </div>
      <nav style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: C.surf, borderTop: `1px solid ${C.border}`, display: "flex", zIndex: 20, boxShadow: "0 -2px 14px rgba(30,34,54,0.08)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        {[["diario", "Diario"], ["objetivos", "Objetivos"], ["gastos", "Gastos"], ["calendario", "Calendario"], ["resumen", "Resumen"]].map(([v, lb]) => { const enPestana = (x) => view === x || (x === "gastos" && view === "gasolineras") || (x === "calendario" && view === "aeropuerto"); return (
          <button key={v} className="nb" onClick={() => setView(v)} style={{ flex: 1, padding: "12px 0 10px", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, background: "none", border: "none", borderTop: `2px solid ${enPestana(v) ? C.acc : "transparent"}`, cursor: "pointer", color: enPestana(v) ? C.accDim : C.t3, fontWeight: enPestana(v) ? 800 : 500, fontSize: 10, fontFamily: "inherit", transition: "color 0.15s, border-color 0.15s" }}>
            <Icono name={v} />{lb}
          </button>
        ); })}
      </nav>
    </div>
  );
}
ReactDOM.createRoot(document.getElementById("root")).render(<Raiz />);
