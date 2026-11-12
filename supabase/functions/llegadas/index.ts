// Llegadas a Barajas para la app TXpro.
//
// La app pide aquí los vuelos. La función guarda la última respuesta en la
// tabla llegadas_cache y solo vuelve a preguntar a AeroDataBox cuando lo
// guardado tiene más de «minutos» (30 por defecto) y alguien abre la app. Así
// el gasto no depende de cuántos conductores haya, y de noche, sin nadie
// mirando, no se gasta nada. La tabla lleva también el tope de llamadas al mes
// y un interruptor (activo) para apagar la función sin tocar la app.
//
// La clave de AeroDataBox va en el secreto RAPIDAPI_KEY del proyecto.
// Solo responde a la app (txpro.app): no es una API abierta.
import { convertir, urlLlegadas, HOST_VUELOS } from "./convertir.mjs";

const ORIGENES = ["https://txpro.app", "https://www.txpro.app"];
const URL_BD = Deno.env.get("SUPABASE_URL") ?? "";
const CLAVE_BD = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const VACIO = { actualizado: "", vuelos: [] };

const bd = (ruta: string, init: RequestInit = {}) =>
  fetch(`${URL_BD}/rest/v1/${ruta}`, { ...init, headers: { apikey: CLAVE_BD, Authorization: `Bearer ${CLAVE_BD}`, "Content-Type": "application/json", ...(init.headers ?? {}) } });

const guardar = (campos: Record<string, unknown>) =>
  bd("llegadas_cache?id=eq.1", { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(campos) });

Deno.serve(async (req) => {
  const origen = req.headers.get("origin") ?? "";
  const cabeceras: Record<string, string> = { "Content-Type": "application/json; charset=utf-8", Vary: "Origin" };
  if (ORIGENES.includes(origen)) cabeceras["Access-Control-Allow-Origin"] = origen;
  const responder = (cuerpo: unknown, estado = 200, extra: Record<string, string> = {}) =>
    new Response(JSON.stringify(cuerpo), { status: estado, headers: { ...cabeceras, ...extra } });

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...cabeceras, "Access-Control-Allow-Methods": "GET", "Access-Control-Max-Age": "86400" } });
  if (req.method !== "GET") return responder({ error: "solo GET" }, 405);
  if (!ORIGENES.includes(origen)) return responder({ error: "solo para la app TXpro" }, 403);

  try {
    const r = await bd("llegadas_cache?id=eq.1&select=activo,actualizado,datos,minutos");
    const fila = r.ok ? (await r.json())[0] : null;
    if (!fila || !fila.activo) return responder(VACIO, 200, { "Cache-Control": "public, max-age=300" });

    let datos = fila.datos ?? VACIO;
    const edad = fila.actualizado ? Date.now() - Date.parse(fila.actualizado) : Infinity;
    if (edad > (fila.minutos ?? 30) * 60000) {
      // Solo una petición a la vez pregunta a AeroDataBox; las demás sirven lo guardado.
      const turno = await bd("rpc/llegadas_reclamar", { method: "POST", body: "{}" });
      if (turno.ok && (await turno.json()) === true) {
        try {
          const clave = Deno.env.get("RAPIDAPI_KEY");
          if (!clave) throw new Error("falta el secreto RAPIDAPI_KEY");
          const v = await fetch(urlLlegadas(), { headers: { "X-RapidAPI-Key": clave, "X-RapidAPI-Host": HOST_VUELOS } });
          if (!v.ok) throw new Error(`AeroDataBox respondió ${v.status}: ${(await v.text()).slice(0, 160)}`);
          datos = convertir(await v.json());
          await guardar({ actualizado: new Date().toISOString(), datos, pidiendo_desde: null, ultimo_error: null, unidades_restantes: Number(v.headers.get("x-ratelimit-api-units-remaining")) || null });
        } catch (e) {
          // No se suelta el turno: así no se reintenta hasta pasados cinco minutos.
          await guardar({ ultimo_error: `${new Date().toISOString()} ${String((e as Error).message ?? e).slice(0, 300)}` });
        }
      }
    }
    return responder(datos, 200, { "Cache-Control": "public, max-age=120" });
  } catch (_e) {
    return responder(VACIO, 200);
  }
});
