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
const monthShort = (ym) => { const [y, m] = ym.split("-"); return new Date(y, m - 1).toLocaleDateString("es-ES", { month: "short" }); };
const calcDay = (d, pct = 50) => { const n = (v) => Number(v) || 0; const facturacion = n(d.taximetro) + n(d.uber) + n(d.cabify) + n(d.bolt) + n(d.fnt9); const conductor50 = facturacion * (pct / 100); const cobradoEmpresa = (n(d.uber) - n(d.uberEfec)) + (n(d.cabify) - n(d.cabifyEfec)) + (n(d.bolt) - n(d.boltEfec)) + n(d.fncob) + n(d.visa); const diferencia = conductor50 - cobradoEmpresa; return { facturacion, conductor50, cobradoEmpresa, diferencia }; };
const DEFAULT_CFG = { pctConductor: 50, incentivo: "ninguno", umbral: "", bonoImporte: "", pctCombustible: "" };
const loadCfg = () => ({ ...DEFAULT_CFG, ...loadStorage("tc_cfg", {}) });
const num = (v) => Number(v) || 0;
const incentivoDe = (cfg, totalFact, combustible) => { const meta = num(cfg.umbral); const llega = totalFact >= meta; if (cfg.incentivo === "bono") { const importe = num(cfg.bonoImporte); if (meta <= 0 || importe <= 0) return { tipo: "incompleto", llega: false, importe: 0 }; return { tipo: "bono", llega, importe: llega ? importe : 0, etiqueta: `🎁 Bono al superar ${fmt0(meta)}`, pendiente: `Faltan ${fmt(Math.max(0, meta - totalFact))} para el bono de ${fmt0(importe)}`, logrado: `✅ ¡Superados los ${fmt0(meta)}! Bono de ${fmt0(importe)} desbloqueado` }; } if (cfg.incentivo === "combustible") { const pc = num(cfg.pctCombustible); if (meta <= 0 || pc <= 0) return { tipo: "incompleto", llega: false, importe: 0 }; return { tipo: "combustible", llega, importe: llega ? combustible * (pc / 100) : 0, etiqueta: `⛽ ${pc}% del combustible`, pendiente: `Faltan ${fmt(Math.max(0, meta - totalFact))} para que te paguen el ${pc}% del combustible`, logrado: `✅ ¡Superados los ${fmt0(meta)}! Te pagan el ${pc}% del combustible` }; } return { tipo: "ninguno", llega: false, importe: 0 }; };
const summarize = (entries, pct = 50) => { let acum = 0; const rows = entries.map(([date, d]) => { const s = calcDay(d, pct); acum += s.facturacion; return { date, s, acumFact: acum }; }); const conductor = acum * (pct / 100); const cobrado = rows.reduce((a, r) => a + r.s.cobradoEmpresa, 0); const efectivo = rows.reduce((a, r) => a + (r.s.facturacion - r.s.cobradoEmpresa), 0); const dias = rows.length; return { rows, totalFact: acum, conductorMes: conductor, totalCobradoEmpresa: cobrado, diferenciaMes: conductor - cobrado, efectivoMes: efectivo, diasTrabajados: dias, mediaDiaria: dias ? acum / dias : 0 }; };
const EMPTY = { taximetro: 0, uber: 0, uberEfec: 0, cabify: 0, cabifyEfec: 0, bolt: 0, boltEfec: 0, fnt9: 0, fncob: 0, visa: 0 };
const EFEC_TRIOS = [["uber", "uberEfec", "uberCob"], ["cabify", "cabifyEfec", "cabifyCob"], ["bolt", "boltEfec", "boltCob"]];
const today = todayStr();
const loadStorage = (key, fallback) => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } };
const hasData = (d) => Object.keys(EMPTY).some((k) => (Number(d[k]) || 0) !== 0);
const migrateDay = (d) => { const out = { ...d }; for (const [fact, efec, oldCob] of EFEC_TRIOS) { if (out[efec] === undefined) { const total = Number(out[fact]) || 0; const cobrado = out[oldCob] === undefined ? total : Number(out[oldCob]) || 0; out[efec] = Math.max(0, total - cobrado); } delete out[oldCob]; } return out; };
const loadDays = () => Object.fromEntries(Object.entries(loadStorage("tc_days", {})).filter(([, d]) => hasData(d)).map(([date, d]) => [date, migrateDay(d)]));
const C = { bg: "#f5f6fa", surf: "#ffffff", border: "#e3e6f0", acc: "#f0c040", accDim: "#8a6a17", green: "#189a5f", red: "#d63b3b", blue: "#2f6fe0", t1: "#1a1d29", t2: "#5c6178", t3: "#8f93a8" };
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

const TaxiLogo = ({ size = 26, color = "#0d0f14" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={{ flexShrink: 0, display: "block" }}>
    <path d="M18.92 6c-.2-.58-.76-1-1.42-1h-11c-.66 0-1.21.42-1.42 1L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-6zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z" />
  </svg>
);
// Neutral badges instead of the platforms' own logos: the names are used to say
// which service a field is for, but reproducing their marks in a published app
// is someone else's trademark to license.
const Badge = ({ children, size = 28 }) => (
  <span style={{ width: size, height: size, borderRadius: 8, background: "#2f3545", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: children && children.length > 1 ? 10 : 13, fontWeight: 800, letterSpacing: -0.2, flexShrink: 0 }}>{children}</span>
);
const CardMark = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ flexShrink: 0, display: "block" }} aria-hidden="true">
    <rect x="1.5" y="4.5" width="21" height="15" rx="3" fill="#2f3545" />
    <rect x="1.5" y="8" width="21" height="3" fill="#8f93a8" />
    <rect x="4.5" y="14" width="6" height="2.2" rx="1.1" fill="#fff" />
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
    <div><div style={{ fontSize: 12, color: C.t2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>{neg ? "🟢 Empresa debe al conductor" : "🔴 Conductor debe a empresa"}</div><div style={{ fontSize: 11, color: C.t3, marginTop: 3 }}>{sub}</div></div>
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
  const [fuelEntries, setFuelEntries] = useState(() => loadStorage("tc_fuel", []));
  const [fuelForm, setFuelForm] = useState({ date: today, importe: "" });
  const [fuelSaved, setFuelSaved] = useState(false);
  const [cfg, setCfg] = useState(loadCfg);
  const [copia, setCopia] = useState(null);
  const [copiaMsg, setCopiaMsg] = useState("");
  const [hayUpdate, setHayUpdate] = useState(false);
  useEffect(() => { const h = () => setHayUpdate(true); window.addEventListener("tc:update-ready", h); return () => window.removeEventListener("tc:update-ready", h); }, []);
  const [cfgOk, setCfgOk] = useState(() => loadStorage("tc_cfg_ok", false) === true);
  const marcarCfgOk = () => { setCfgOk(true); try { localStorage.setItem("tc_cfg_ok", "true"); } catch {} };
  const pct = num(cfg.pctConductor);
  const [selectedMonth, setSelectedMonth] = useState(monthKey(today));
  const [rangeFrom, setRangeFrom] = useState(() => monthStart(today));
  const [rangeTo, setRangeTo] = useState(today);
  useEffect(() => { try { localStorage.setItem("tc_days", JSON.stringify(days)); } catch {} }, [days]);
  useEffect(() => { try { localStorage.setItem("tc_fuel", JSON.stringify(fuelEntries)); } catch {} }, [fuelEntries]);
  useEffect(() => { try { localStorage.setItem("tc_cfg", JSON.stringify(cfg)); } catch {} }, [cfg]);
  const saveDay = () => { const parsed = {}; for (const k of Object.keys(EMPTY)) parsed[k] = parseFloat(form[k]) || 0; const vacio = !hasData(parsed); setDays((prev) => { const next = { ...prev }; if (vacio) delete next[editDate]; else next[editDate] = parsed; return next; }); setSaved(vacio ? "borrado" : "guardado"); setTimeout(() => setSaved(false), 2000); };
  const changeDate = (d) => { setEditDate(d); setForm(days[d] ? { ...days[d] } : { ...EMPTY }); };
  const dayStats = useMemo(() => { const raw = {}; for (const k of Object.keys(EMPTY)) raw[k] = parseFloat(form[k]) || 0; return calcDay(raw, pct); }, [form, pct]);
  const saveFuel = () => { const importe = parseFloat(fuelForm.importe) || 0; if (!importe) return; setFuelEntries((prev) => [...prev, { id: Date.now(), date: fuelForm.date, importe }]); setFuelForm((f) => ({ ...f, importe: "" })); setFuelSaved(true); setTimeout(() => setFuelSaved(false), 2000); };
  const fuelByMonth = useMemo(() => { const byMonth = {}; fuelEntries.forEach((e) => { const m = monthKey(e.date); if (!byMonth[m]) byMonth[m] = 0; byMonth[m] += e.importe; }); return byMonth; }, [fuelEntries]);
  const months = useMemo(() => [...new Set(Object.keys(days).map(monthKey))].sort().reverse(), [days]);
  const monthData = useMemo(() => months.map((ym) => { const entries = Object.entries(days).filter(([d]) => monthKey(d) === ym).sort(([a], [b]) => a.localeCompare(b)); const combustibleMes = fuelByMonth[ym] || 0; const s = summarize(entries, pct); return { ym, ...s, combustibleMes, incentivo: incentivoDe(cfg, s.totalFact, combustibleMes) }; }), [months, days, fuelByMonth, pct, cfg]);
  useEffect(() => { if (months.length && !months.includes(selectedMonth)) setSelectedMonth(months[0]); }, [months]);
  const selectedData = monthData.find((m) => m.ym === selectedMonth);
  const rangeData = useMemo(() => { const lo = rangeFrom <= rangeTo ? rangeFrom : rangeTo; const hi = rangeFrom <= rangeTo ? rangeTo : rangeFrom; return summarize(Object.entries(days).filter(([d]) => d >= lo && d <= hi).sort(([a], [b]) => a.localeCompare(b)), pct); }, [days, rangeFrom, rangeTo, pct]);
  const maxFact = Math.max(1, ...monthData.map((m) => m.totalFact));
  const exportarCopia = async () => {
    const payload = { app: "txpro", formato: 1, exportado: new Date().toISOString(), appVersion: APP_VERSION, days, fuel: fuelEntries, cfg };
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
      setCopia({ datos, dias: fechas.length, repostajes: Array.isArray(datos.fuel) ? datos.fuel.length : 0, desde: fechas[0], hasta: fechas[fechas.length - 1] });
    } catch { setCopiaMsg("No se pudo leer el archivo."); }
  };
  const restaurarCopia = () => {
    if (!copia) return;
    const { datos } = copia;
    const limpios = Object.fromEntries(Object.entries(datos.days).filter(([d, v]) => /^\d{4}-\d{2}-\d{2}$/.test(d) && v && typeof v === "object" && hasData(v)).map(([d, v]) => [d, migrateDay(v)]));
    setDays(limpios);
    setFuelEntries(Array.isArray(datos.fuel) ? datos.fuel.filter((e) => e && e.date && Number(e.importe)) : []);
    if (datos.cfg && typeof datos.cfg === "object") { setCfg({ ...DEFAULT_CFG, ...datos.cfg }); marcarCfgOk(); }
    setForm(limpios[editDate] ? { ...limpios[editDate] } : { ...EMPTY });
    setCopia(null);
    setCopiaMsg(`Restaurados ${Object.keys(limpios).length} días.`);
  };
  const brandName = { fontSize: 14, fontWeight: 700, color: C.t1 };
  const FIELDS = [
    { key: "taximetro", name: "Taxi", full: true, head: <><TaxiLogo size={26} color={C.acc} /><span style={{ ...brandName, fontSize: 15, fontWeight: 900, color: "#c08a06", letterSpacing: 0.5 }}>TAXI</span></> },
    { key: "uber", cobKey: "uberEfec", cobLabel: "EFECTIVO", cobColor: C.blue, name: "Uber", head: <><Badge>U</Badge><span style={brandName}>Uber</span></> },
    { key: "cabify", cobKey: "cabifyEfec", cobLabel: "EFECTIVO", cobColor: C.blue, name: "Cabify", head: <><Badge>C</Badge><span style={brandName}>Cabify</span></> },
    { key: "bolt", cobKey: "boltEfec", cobLabel: "EFECTIVO", cobColor: C.blue, name: "Bolt", head: <><Badge>B</Badge><span style={brandName}>Bolt</span></> },
    { key: "fnt9", cobKey: "fncob", cobLabel: "COBRADO", cobColor: C.green, name: "FreeNow T9", head: <><Badge>FN</Badge><span style={brandName}>FreeNow T9</span></> },
    { key: "visa", name: "Tarjeta", full: true, head: <><CardMark /><span style={brandName}>Tarjeta</span></> },
  ];
  const cobTag = (bg) => ({ background: bg, color: "#fff", fontSize: 9, fontWeight: 800, letterSpacing: 0.3, padding: "3px 7px", borderRadius: 6, display: "inline-block", margin: "7px 0 5px" });
  const inp = { width: "100%", background: "#f6f7fb", border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "11px 12px", color: C.t1, fontSize: 15, fontWeight: 700, fontFamily: "inherit" };
  return (
    <div style={{ maxWidth: 480, margin: "0 auto", minHeight: "100vh", background: C.bg, color: C.t1, fontFamily: "'DM Sans', sans-serif", paddingBottom: "calc(80px + env(safe-area-inset-bottom, 0px))" }}>
      <div style={{ background: `linear-gradient(180deg, ${C.surf}, #eef0f7)`, borderBottom: `2px solid ${C.acc}40`, padding: "18px 20px 14px", paddingTop: "calc(18px + env(safe-area-inset-top, 0px))", position: "sticky", top: 0, zIndex: 10, boxShadow: "0 2px 14px rgba(30,34,54,0.08)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <TXLogo size={52} />
          <div style={{ flex: 1 }}><div style={{ fontSize: 19, fontWeight: 900, letterSpacing: -0.5, color: C.t1 }}>TX<span style={{ color: C.accDim }}>pro</span></div><div style={{ fontSize: 11, color: C.t2 }}>Liquidaciones · Facturación · Comisiones</div></div>
          <button className="nb" onClick={() => setView(view === "ajustes" ? "diario" : "ajustes")} aria-label="Ajustes" style={{ background: view === "ajustes" ? `${C.acc}22` : C.surf, border: `1px solid ${view === "ajustes" ? C.acc : C.border}`, borderRadius: 12, width: 40, height: 40, fontSize: 19, cursor: "pointer", flexShrink: 0, lineHeight: 1 }}>⚙️</button>
        </div>
      </div>
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
          {saved && <div style={{ background: `${C.green}18`, border: `1px solid ${C.green}44`, borderRadius: 10, padding: 11, color: C.green, fontWeight: 700, textAlign: "center", marginBottom: 12, fontSize: 13 }}>{saved === "borrado" ? "🗑️ Día eliminado" : "✅ Día guardado"}</div>}
          <div style={{ ...card, padding: 16, marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: C.t2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 14 }}>Ingresos del día</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {FIELDS.map(({ key, cobKey, cobLabel, cobColor, name, head, gap, full }) => (<div key={key} style={full ? { gridColumn: "span 2" } : undefined}><div style={{ display: "flex", alignItems: "center", gap: gap ?? 8, height: 30, marginBottom: 7 }}>{head}</div><input className="inp" type="number" min="0" step="0.01" placeholder="0.00" aria-label={name} style={inp} value={form[key] || ""} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />{cobKey && <><div><span style={cobTag(cobColor)}>{cobLabel}</span></div><input className="inp" type="number" min="0" step="0.01" placeholder="0.00" aria-label={`${name} ${cobLabel.toLowerCase()}`} style={inp} value={form[cobKey] || ""} onChange={(e) => setForm((f) => ({ ...f, [cobKey]: e.target.value }))} /></>}</div>))}
            </div>
          </div>
          <div style={{ background: `linear-gradient(135deg, ${C.acc}18, ${C.acc}08)`, border: `2px solid ${C.acc}55`, borderRadius: 16, padding: "14px 18px", marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: `0 4px 16px ${C.acc}1a` }}>
            <div><div style={{ fontSize: 11, color: C.accDim, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Total facturación día</div><div style={{ fontSize: 11, color: C.t3, marginTop: 3 }}>Taxímetro + apps</div></div>
            <div style={{ fontSize: 28, fontWeight: 900, color: C.accDim }}>{fmt(dayStats.facturacion)}</div>
          </div>
          <div style={{ ...card, padding: 16, marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: C.t2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Cálculo del día</div>
            {[{ label: `${pct}% conductor (sobre fact. base)`, val: dayStats.conductor50, color: C.accDim, bold: true }, { label: "Cobrado por empresa (cobrado en apps + tarjeta)", val: dayStats.cobradoEmpresa, color: C.t2 }, { label: "💵 Cobrado en efectivo por el conductor", val: dayStats.facturacion - dayStats.cobradoEmpresa, color: C.blue }].map(({ label, val, color, bold }, i, arr) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : "none" }}>
                <span style={{ fontSize: 13, color: C.t2 }}>{label}</span><span style={{ fontSize: bold ? 16 : 14, fontWeight: bold ? 800 : 600, color }}>{fmt(val)}</span>
              </div>
            ))}
          </div>
          {(() => { const neg = dayStats.diferencia <= 0; return (
            <div style={{ background: neg ? `${C.green}14` : `${C.red}14`, border: `1.5px solid ${neg ? C.green : C.red}44`, borderRadius: 16, padding: "16px", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div><div style={{ fontSize: 12, color: C.t2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>{neg ? "🟢 Empresa debe al conductor" : "🔴 Conductor debe a empresa"}</div><div style={{ fontSize: 11, color: C.t3, marginTop: 4 }}>{neg ? "Empresa cobró más → paga diferencia" : "Conductor cobró más efectivo → descuenta"}</div></div>
              <div style={{ fontSize: 26, fontWeight: 900, color: neg ? C.green : C.red, marginLeft: 14, whiteSpace: "nowrap" }}>{neg ? "−" : "+"}{fmt(Math.abs(dayStats.diferencia))}</div>
            </div>
          ); })()}
          <button className="saveBtn" onClick={saveDay} style={{ width: "100%", padding: 14, borderRadius: 12, border: "none", background: `linear-gradient(135deg,${C.acc},${C.accDim})`, color: "#0d0f14", fontWeight: 900, fontSize: 15, cursor: "pointer", fontFamily: "inherit", boxShadow: `0 4px 16px ${C.acc}38` }}>Guardar día</button>
        </>}
        {view === "combustible" && <>
          <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 14 }}>Combustible</div>
          {fuelSaved && <div style={{ background: `${C.green}18`, border: `1px solid ${C.green}44`, borderRadius: 10, padding: 11, color: C.green, fontWeight: 700, textAlign: "center", marginBottom: 12, fontSize: 13 }}>✅ Guardado</div>}
          <div style={{ ...card, padding: 16, marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: C.t2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 14 }}>Nuevo repostaje</div>
            <label style={{ fontSize: 12, color: C.t2, fontWeight: 600, marginBottom: 5, display: "block" }}>Mes</label>
            <input type="month" className="inp" style={{ ...inp, fontSize: 14, marginBottom: 12 }} value={fuelForm.date.slice(0, 7)} onChange={(e) => setFuelForm((f) => ({ ...f, date: e.target.value + "-01" }))} />
            <label style={{ fontSize: 12, color: C.t2, fontWeight: 600, marginBottom: 5, display: "block" }}>Importe total (€)</label>
            <input className="inp" type="number" min="0" step="0.01" placeholder="0.00" style={{ ...inp, marginBottom: 14 }} value={fuelForm.importe} onChange={(e) => setFuelForm((f) => ({ ...f, importe: e.target.value }))} />
            <button className="saveBtn" onClick={saveFuel} style={{ width: "100%", padding: 13, borderRadius: 12, border: "none", background: `linear-gradient(135deg,${C.acc},${C.accDim})`, color: "#0d0f14", fontWeight: 900, fontSize: 15, cursor: "pointer", fontFamily: "inherit", boxShadow: `0 4px 16px ${C.acc}38` }}>Guardar</button>
          </div>
          {(() => { const meses = [...new Set(fuelEntries.map((e) => monthKey(e.date)))].sort().reverse(); if (meses.length === 0) return <div style={{ color: C.t2, textAlign: "center", padding: 32, fontSize: 14 }}>Sin repostajes registrados.</div>; return meses.map((m) => (<div key={m} style={{ ...card, padding: 16, marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}><div><div style={{ fontSize: 11, color: C.t2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Combustible</div><div style={{ fontSize: 14, fontWeight: 700, color: C.t1, marginTop: 2 }}>{monthLabel(m)}</div></div><div style={{ display: "flex", alignItems: "center", gap: 10 }}><div style={{ fontSize: 20, fontWeight: 900, color: C.red }}>−{fmt(fuelByMonth[m])}</div><button onClick={() => setFuelEntries((prev) => prev.filter((e) => monthKey(e.date) !== m))} style={{ background: `${C.red}18`, border: `1px solid ${C.red}33`, borderRadius: 8, padding: "4px 9px", color: C.red, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>✕</button></div></div>)); })()}
        </>}
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
            {selectedData && (() => { const { rows, totalFact, conductorMes, totalCobradoEmpresa, diferenciaMes, efectivoMes, incentivo, combustibleMes, diasTrabajados, mediaDiaria } = selectedData; return (
              <div>
                <Hero total={totalFact} conductor={conductorMes} pct={pct} />
                <StatCard title="Liquidación mensual" items={[{ label: `📊 Media diaria (${diasTrabajados} ${diasTrabajados === 1 ? "día" : "días"})`, val: mediaDiaria, color: C.t1 }, { label: `${pct}% conductor s/ facturación base`, val: conductorMes, color: C.accDim, bold: true }, { label: "Cobrado por empresa (acumulado mes)", val: totalCobradoEmpresa, color: C.t1 }, { label: "💵 Efectivo cobrado por el conductor", val: efectivoMes, color: C.blue }, ...(combustibleMes > 0 ? [{ label: "⛽ Combustible del mes (informativo)", val: combustibleMes, color: C.red, neg: true }] : []), ...(incentivo.importe > 0 ? [{ label: incentivo.etiqueta, val: incentivo.importe, color: C.green }] : [])]}>
                  {incentivo.tipo === "ninguno" ? null : incentivo.tipo === "incompleto" ? <div style={{ background: `${C.acc}08`, border: `1px solid ${C.acc}22`, borderRadius: 10, padding: "8px 12px", marginTop: 10, fontSize: 12, color: C.t2 }}>Te falta indicar tu incentivo en Ajustes ⚙️</div> : incentivo.llega ? <div style={{ background: `${C.green}12`, border: `1px solid ${C.green}33`, borderRadius: 10, padding: "8px 12px", marginTop: 10, fontSize: 12, color: C.green, fontWeight: 700 }}>{incentivo.logrado}</div>
                  : <div style={{ background: `${C.acc}08`, border: `1px solid ${C.acc}22`, borderRadius: 10, padding: "8px 12px", marginTop: 10, fontSize: 12, color: C.t2 }}>{incentivo.pendiente}</div>}
                </StatCard>
                <Balance value={diferenciaMes} sub="Balance mensual acumulado" />
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
            <label style={{ fontSize: 12, color: C.t2, fontWeight: 600, marginBottom: 5, display: "block" }}>Qué % de la facturación te llevas</label>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input className="inp" type="number" min="0" max="100" step="0.5" aria-label="Porcentaje del conductor" style={{ ...inp, flex: 1 }} value={cfg.pctConductor} onChange={(e) => set("pctConductor", e.target.value)} />
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
              <label style={{ fontSize: 12, color: C.t2, fontWeight: 600, marginBottom: 5, display: "block" }}>A partir de cuánto facturado al mes (€)</label>
              <input className="inp" type="number" min="0" step="50" aria-label="Umbral de facturación" placeholder="0" style={{ ...inp, marginBottom: 12 }} value={cfg.umbral} onChange={(e) => set("umbral", e.target.value)} />
              {cfg.incentivo === "bono" ? <>
                <label style={{ fontSize: 12, color: C.t2, fontWeight: 600, marginBottom: 5, display: "block" }}>Te dan de bono (€)</label>
                <input className="inp" type="number" min="0" step="5" aria-label="Importe del bono" placeholder="0" style={inp} value={cfg.bonoImporte} onChange={(e) => set("bonoImporte", e.target.value)} />
              </> : <>
                <label style={{ fontSize: 12, color: C.t2, fontWeight: 600, marginBottom: 5, display: "block" }}>Te pagan este % del combustible</label>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <input className="inp" type="number" min="0" max="100" step="1" aria-label="Porcentaje del combustible" placeholder="0" style={{ ...inp, flex: 1 }} value={cfg.pctCombustible} onChange={(e) => set("pctCombustible", e.target.value)} />
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
        <div style={{ fontSize: 11, color: C.t2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Copia de seguridad</div>
        <div style={{ fontSize: 12.5, color: C.t2, lineHeight: 1.5, marginBottom: 12 }}>Tus cuentas se guardan solo en este móvil. Si lo pierdes o desinstalas la app, se van contigo. Guarda una copia de vez en cuando.</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="saveBtn" onClick={exportarCopia} style={{ flex: 1, padding: 11, borderRadius: 10, border: "none", background: `linear-gradient(135deg,${C.acc},${C.accDim})`, color: "#0d0f14", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Exportar copia</button>
          <button className="nb" onClick={() => document.getElementById("tcImport").click()} style={{ flex: 1, padding: 11, borderRadius: 10, border: `1px solid ${C.border}`, background: C.surf, color: C.t2, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Importar copia</button>
        </div>
        <input id="tcImport" type="file" accept="application/json,.json" style={{ display: "none" }} onChange={(e) => { leerCopia(e.target.files && e.target.files[0]); e.target.value = ""; }} />
        {copiaMsg && <div style={{ marginTop: 10, fontSize: 12, color: C.t2 }}>{copiaMsg}</div>}
        {copia && <div style={{ marginTop: 12, background: `${C.red}0e`, border: `1.5px solid ${C.red}44`, borderRadius: 12, padding: 13 }}>
          <div style={{ fontSize: 13, color: C.t1, lineHeight: 1.55 }}>La copia tiene <strong>{copia.dias} {copia.dias === 1 ? "día" : "días"}</strong>{copia.desde ? <> ({dayMonth(copia.desde)} – {dayMonth(copia.hasta)})</> : null} y {copia.repostajes} {copia.repostajes === 1 ? "repostaje" : "repostajes"}.</div>
          <div style={{ fontSize: 12.5, color: C.red, fontWeight: 700, margin: "7px 0 11px" }}>Ahora tienes {Object.keys(days).length} días guardados. Al restaurar se reemplazan por los de la copia.</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="saveBtn" onClick={restaurarCopia} style={{ flex: 1, padding: 10, borderRadius: 10, border: "none", background: C.red, color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Restaurar</button>
            <button className="nb" onClick={() => setCopia(null)} style={{ flex: 1, padding: 10, borderRadius: 10, border: `1px solid ${C.border}`, background: C.surf, color: C.t2, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Cancelar</button>
          </div>
        </div>}
      </div>
      <button className="saveBtn" onClick={() => setCfg({ ...DEFAULT_CFG })} style={{ width: "100%", padding: 12, borderRadius: 12, border: `1px solid ${C.border}`, background: C.surf, color: C.t2, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Restaurar valores por defecto</button>
      <div style={{ textAlign: "center", fontSize: 11, color: C.t3, margin: "14px 0 20px" }}>
        <a href="./privacidad.html" target="_blank" rel="noopener" style={{ color: C.accDim, fontWeight: 700, textDecoration: "none", fontSize: 12 }}>Política de privacidad</a>
        <div style={{ marginTop: 7 }}>TXpro · versión {APP_VERSION}</div>
        <div style={{ marginTop: 3 }}>Tus datos se guardan solo en este móvil.</div>
      </div>
        </>); })()}
        {view === "periodo" && (() => { const lo = rangeFrom <= rangeTo ? rangeFrom : rangeTo; const hi = rangeFrom <= rangeTo ? rangeTo : rangeFrom; const { rows, totalFact, conductorMes, totalCobradoEmpresa, diferenciaMes, efectivoMes, diasTrabajados, mediaDiaria } = rangeData; const atajos = [["Esta semana", weekStart(today), today], ["Últimos 7 días", shiftDays(today, -6), today], ["Este mes", monthStart(today), today]]; return (<>
          <div style={{ ...card, padding: 16, marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: C.t2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Elige el periodo</div>
            <div style={{ display: "flex", gap: 7, marginBottom: 14 }}>
              {atajos.map(([lb, f, t]) => { const on = rangeFrom === f && rangeTo === t; return (
                <button key={lb} className="nb" onClick={() => { setRangeFrom(f); setRangeTo(t); }} style={{ flex: 1, padding: "9px 4px", borderRadius: 10, border: `1.5px solid ${on ? C.acc : C.border}`, background: on ? `${C.acc}18` : C.surf, color: on ? C.accDim : C.t2, fontWeight: on ? 800 : 600, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>{lb}</button>
              ); })}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ minWidth: 0 }}><label style={{ fontSize: 12, color: C.t2, fontWeight: 600, marginBottom: 5, display: "block" }}>Desde</label><input type="date" className="inp" style={{ ...inp, fontSize: 13 }} value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} /></div>
              <div style={{ minWidth: 0 }}><label style={{ fontSize: 12, color: C.t2, fontWeight: 600, marginBottom: 5, display: "block" }}>Hasta</label><input type="date" className="inp" style={{ ...inp, fontSize: 13 }} value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} /></div>
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
            <StatCard title="Resumen del periodo" items={[{ label: `📊 Media diaria (${diasTrabajados} ${diasTrabajados === 1 ? "día" : "días"})`, val: mediaDiaria, color: C.t1 }, { label: `${pct}% conductor s/ facturación base`, val: conductorMes, color: C.accDim, bold: true }, { label: "Cobrado por empresa (acumulado periodo)", val: totalCobradoEmpresa, color: C.t1 }, { label: "💵 Efectivo cobrado por el conductor", val: efectivoMes, color: C.blue }]} />
            <Balance value={diferenciaMes} sub="Balance del periodo seleccionado" />
            <DayTable rows={rows} pct={pct} />
          </>}
        </>); })()}
      </div>
      <nav style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: C.surf, borderTop: `1px solid ${C.border}`, display: "flex", zIndex: 20, boxShadow: "0 -2px 14px rgba(30,34,54,0.08)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        {[["diario", "📋", "Diario"], ["combustible", "⛽", "Combustible"], ["mensual", "📊", "Mensual"], ["periodo", "📅", "Periodo"]].map(([v, ic, lb]) => (
          <button key={v} className="nb" onClick={() => setView(v)} style={{ flex: 1, padding: "12px 0 10px", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, background: "none", border: "none", borderTop: `2px solid ${view === v ? C.acc : "transparent"}`, cursor: "pointer", color: view === v ? C.accDim : C.t3, fontWeight: view === v ? 800 : 500, fontSize: 10, fontFamily: "inherit", transition: "color 0.15s, border-color 0.15s" }}>
            <span style={{ fontSize: 22 }}>{ic}</span>{lb}
          </button>
        ))}
      </nav>
    </div>
  );
}
ReactDOM.createRoot(document.getElementById("root")).render(<TXpro />);
