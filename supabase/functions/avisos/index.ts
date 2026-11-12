// Avisos al móvil de los días fuertes.
//
// La app llama aquí para apuntarse (alta), borrarse (baja) o pedir un aviso de
// prueba. Una tarea programada llama cada hora con la acción «enviar»: a las
// 20:00 de Madrid mira qué hay mañana en el calendario de eventos de la app y
// manda un aviso a quien se haya apuntado. Si mañana no hay nada, no manda nada.
//
// De cada móvil solo se guarda la dirección a la que mandar el aviso (la da el
// navegador) y si quiere todos los días o solo los más fuertes. Nada de cuentas.
//
// Secretos del proyecto: VAPID_PUBLICA, VAPID_PRIVADA (JWK), CRON_SECRET.
import { enviar, destinoValido } from "./webpush.mjs";

const ORIGENES = ["https://txpro.app", "https://www.txpro.app"];
const URL_BD = Deno.env.get("SUPABASE_URL") ?? "";
const CLAVE_BD = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const EVENTOS = "https://txpro.app/eventos.json";
const GORDO = 3;   // con tres cosas o más, el día es de los fuertes de verdad

const bd = (ruta: string, init: RequestInit = {}) =>
  fetch(`${URL_BD}/rest/v1/${ruta}`, { ...init, headers: { apikey: CLAVE_BD, Authorization: `Bearer ${CLAVE_BD}`, "Content-Type": "application/json", ...(init.headers ?? {}) } });

const claves = () => ({ publica: Deno.env.get("VAPID_PUBLICA") ?? "", privada: JSON.parse(Deno.env.get("VAPID_PRIVADA") ?? "{}"), contacto: "mailto:proyecto.txpro@gmail.com" });

// La fecha y la hora de Madrid, vayan como vayan los relojes del servidor.
const enMadrid = (ms: number) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { fecha: `${p.year}-${p.month}-${p.day}`, hora: Number(p.hour) };
};
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

// Lo que hay un día en el calendario de la app, ordenado por hora.
type Evento = { fecha: string; hasta?: string; titulo: string; lugar?: string; hora?: string; salida?: string };
export const avisoDe = (eventos: Evento[], fecha: string) => {
  const delDia = eventos.filter((e) => e && typeof e.fecha === "string" && typeof e.titulo === "string" && e.fecha <= fecha && (e.hasta || e.fecha) >= fecha);
  if (!delDia.length) return null;
  const hora = (e: Evento) => e.salida || e.hora || "";
  delDia.sort((a, b) => (hora(a) || "99").localeCompare(hora(b) || "99"));
  const linea = (e: Evento) => `${hora(e) ? hora(e).slice(0, 5) + " " : ""}${e.titulo}${e.lugar ? ` (${e.lugar})` : ""}`;
  const d = new Date(fecha + "T12:00:00Z");
  return {
    cuantos: delDia.length,
    titulo: `Mañana, ${DIAS[d.getUTCDay()]} ${d.getUTCDate()}: ${delDia.length === 1 ? "hay 1 cosa" : `hay ${delDia.length} cosas`} en Madrid`,
    cuerpo: delDia.slice(0, 4).map(linea).join(" · ") + (delDia.length > 4 ? ` · y ${delDia.length - 4} más` : ""),
    url: "./#calendario", etiqueta: `dia-${fecha}`,
  };
};

// Manda a una lista de suscripciones y borra las que ya no existen.
const repartir = async (lista: { id: string; endpoint: string; p256dh: string; auth: string }[], aviso: unknown) => {
  let ok = 0, muertas = 0, fallos = 0;
  for (let i = 0; i < lista.length; i += 20) {
    await Promise.all(lista.slice(i, i + 20).map(async (s) => {
      try {
        const estado = await enviar(s, aviso, claves());
        if (estado === 404 || estado === 410) { muertas++; await bd(`avisos_suscripciones?id=eq.${s.id}`, { method: "DELETE" }); }
        else if (estado >= 200 && estado < 300) ok++; else fallos++;
      } catch { fallos++; }
    }));
  }
  return { ok, muertas, fallos };
};

Deno.serve(async (req) => {
  const origen = req.headers.get("origin") ?? "";
  const cabeceras: Record<string, string> = { "Content-Type": "application/json; charset=utf-8", Vary: "Origin" };
  if (ORIGENES.includes(origen)) cabeceras["Access-Control-Allow-Origin"] = origen;
  const responder = (cuerpo: unknown, estado = 200) => new Response(JSON.stringify(cuerpo), { status: estado, headers: cabeceras });

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...cabeceras, "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "content-type", "Access-Control-Max-Age": "86400" } });
  if (req.method !== "POST") return responder({ error: "solo POST" }, 405);

  let p: Record<string, unknown> = {};
  try { p = await req.json(); } catch { return responder({ error: "petición mal formada" }, 400); }

  try {
    // La tarea programada: no viene de la app, viene con el secreto.
    if (p.accion === "enviar") {
      const secreto = Deno.env.get("CRON_SECRET") ?? "";
      if (!secreto || req.headers.get("x-cron-secret") !== secreto) return responder({ error: "no autorizado" }, 403);
      const ahora = enMadrid(Date.now());
      if (ahora.hora !== 20 && p.forzar !== true) return responder({ enviado: false, motivo: "no son las 20:00 en Madrid" });
      const manana = enMadrid(Date.now() + 24 * 3600000).fecha;
      const r = await fetch(EVENTOS, { headers: { Accept: "application/json" } });
      const datos = r.ok ? await r.json() : null;
      const aviso = datos && Array.isArray(datos.eventos) ? avisoDe(datos.eventos, manana) : null;
      if (!aviso) return responder({ enviado: false, motivo: "mañana no hay nada" });
      // Una sola vez por día, aunque la tarea se dispare dos veces.
      const marca = await bd("avisos_envios", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ fecha: manana, cosas: aviso.cuantos }) });
      if (!marca.ok) return responder({ enviado: false, motivo: "ya se mandó" });
      const filtro = aviso.cuantos >= GORDO ? "" : "&nivel=eq.todos";
      const s = await bd(`avisos_suscripciones?select=id,endpoint,p256dh,auth${filtro}`);
      const resultado = await repartir(s.ok ? await s.json() : [], aviso);
      await bd(`avisos_envios?fecha=eq.${manana}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(resultado) });
      return responder({ enviado: true, fecha: manana, ...resultado });
    }

    // Lo demás, solo desde la app.
    if (!ORIGENES.includes(origen)) return responder({ error: "solo para la app TXpro" }, 403);
    const sus = (p.suscripcion ?? {}) as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    const endpoint = String(p.endpoint ?? sus.endpoint ?? "");
    if (!destinoValido(endpoint) || endpoint.length > 1000) return responder({ error: "suscripción no válida" }, 400);

    if (p.accion === "alta") {
      const p256dh = String(sus.keys?.p256dh ?? ""), auth = String(sus.keys?.auth ?? "");
      if (!/^[A-Za-z0-9_-]{80,100}$/.test(p256dh) || !/^[A-Za-z0-9_-]{16,40}$/.test(auth)) return responder({ error: "suscripción no válida" }, 400);
      const nivel = p.nivel === "gordos" ? "gordos" : "todos";
      const r = await bd("avisos_suscripciones?on_conflict=endpoint", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ endpoint, p256dh, auth, nivel }) });
      return r.ok ? responder({ ok: true, nivel }) : responder({ error: "no se pudo guardar" }, 500);
    }
    if (p.accion === "baja") {
      await bd(`avisos_suscripciones?endpoint=eq.${encodeURIComponent(endpoint)}`, { method: "DELETE" });
      return responder({ ok: true });
    }
    if (p.accion === "prueba") {
      // Solo a quien ya está apuntado, y como mucho una vez por minuto.
      const turno = await bd("rpc/avisos_turno_prueba", { method: "POST", body: JSON.stringify({ destino: endpoint }) });
      const fila = turno.ok ? await turno.json() : null;
      if (!fila || !fila.length) return responder({ error: "espera un minuto antes de pedir otro" }, 429);
      const estado = await enviar(fila[0], { titulo: "TXpro: los avisos funcionan", cuerpo: "Así te llegará, la tarde antes, lo que haya en Madrid al día siguiente.", url: "./#calendario", etiqueta: "prueba" }, claves());
      return responder({ ok: estado >= 200 && estado < 300, estado });
    }
    return responder({ error: "acción desconocida" }, 400);
  } catch (e) {
    return responder({ error: String((e as Error).message ?? e).slice(0, 200) }, 500);
  }
});
