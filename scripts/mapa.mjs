// Genera mapa-madrid.json: la Comunidad de Madrid con sus 179 municipios, a
// partir de los contornos del Instituto Geográfico Nacional (paquete es-atlas).
// El mapa va dentro de la app: sin servidores de mapas de fuera, funciona sin
// cobertura y no le cuenta a nadie qué se está mirando.
//
//   npm run mapa
import { readFile, writeFile } from "node:fs/promises";
import { feature, mesh, merge } from "topojson-client";

const topo = JSON.parse(await readFile("node_modules/es-atlas/es/municipalities.json", "utf8"));
const madrid = { type: "GeometryCollection", geometries: topo.objects.municipalities.geometries.filter((g) => String(g.id).startsWith("28")) };

// Proyección equirectangular corregida por la latitud de Madrid: para una zona
// de poco más de un grado es exacta a efectos de un mapa de bolsillo. La app
// usa estos mismos números para colocar los recintos.
const LAT0 = 40.42, LON0 = -3.70, K = 1000, COS = Math.cos((LAT0 * Math.PI) / 180);
const px = ([lon, lat]) => [(lon - LON0) * COS * K, (LAT0 - lat) * K];
const r1 = (n) => Math.round(n * 10) / 10;
const trazo = (lineas) => lineas.map((l) => { let prev = null; const pts = []; for (const p of l.map(px)) { const q = [r1(p[0]), r1(p[1])]; if (!prev || q[0] !== prev[0] || q[1] !== prev[1]) pts.push(q); prev = q; } return "M" + pts.map((q) => q.join(",")).join("L"); }).join("");
const lineasDe = (g) => (g.type === "MultiLineString" ? g.coordinates : [g.coordinates]);

// La Comunidad entera como un solo polígono, para rellenarla; y su recuadro,
// para la vista de "toda la Comunidad".
const union = merge(topo, madrid.geometries);
const anillosTierra = union.type === "MultiPolygon" ? union.coordinates.flat() : union.coordinates;
const tierra = anillosTierra.map((r) => trazo([r]) + "Z").join("");
const todos = anillosTierra.flat().map(px);
const xs = todos.map((p) => p[0]), ys = todos.map((p) => p[1]);
const caja = [Math.floor(Math.min(...xs)), Math.floor(Math.min(...ys)), Math.ceil(Math.max(...xs) - Math.min(...xs)), Math.ceil(Math.max(...ys) - Math.min(...ys))];
const bordes = trazo(lineasDe(mesh(topo, madrid, (a, b) => a !== b)));
const capitalGeo = feature(topo, madrid.geometries.find((g) => g.id === "28079")).geometry;
const anillos = capitalGeo.type === "MultiPolygon" ? capitalGeo.coordinates.flat() : capitalGeo.coordinates;
const capital = trazo(anillos) + "Z";

// Centro de cada municipio (el del polígono más grande), para poner el nombre.
const centro = (geo) => {
  const polys = geo.type === "MultiPolygon" ? geo.coordinates : [geo.coordinates];
  let mejor = null;
  for (const poly of polys) {
    const r = poly[0].map(px); let a = 0, cx = 0, cy = 0;
    for (let i = 0; i < r.length - 1; i++) { const f = r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; a += f; cx += (r[i][0] + r[i + 1][0]) * f; cy += (r[i][1] + r[i + 1][1]) * f; }
    if (!mejor || Math.abs(a) > Math.abs(mejor.a)) mejor = { a, x: cx / (3 * a), y: cy / (3 * a) };
  }
  return [r1(mejor.x), r1(mejor.y)];
};
// Solo los nombres que orientan: los grandes y los que tienen recintos. Se
// buscan por el nombre oficial del IGN, no por código: si alguno no aparece, el
// script para en vez de poner un nombre en el municipio equivocado.
// "zona": sale en la vista de Madrid y alrededores; "comunidad": en la de toda la Comunidad.
const NOMBRES = [
  ["Madrid", "Madrid", "ambas"], ["Getafe", "Getafe", "ambas"], ["Leganés", "Leganés", "zona"], ["Alcorcón", "Alcorcón", "zona"],
  ["Móstoles", "Móstoles", "zona"], ["Fuenlabrada", "Fuenlabrada", "zona"], ["Pozuelo de Alarcón", "Pozuelo", "zona"],
  ["Rivas-Vaciamadrid", "Rivas", "zona"], ["Coslada", "Coslada", "zona"], ["Parla", "Parla", "zona"], ["Humanes de Madrid", "Humanes", "zona"],
  ["Valdemoro", "Valdemoro", "comunidad"], ["Torrejón de Ardoz", "Torrejón", "comunidad"], ["Alcalá de Henares", "Alcalá", "comunidad"],
  ["Alcobendas", "Alcobendas", "comunidad"], ["Aranjuez", "Aranjuez", "comunidad"], ["San Martín de la Vega", "S. Martín de la Vega", "comunidad"],
  ["Majadahonda", "Majadahonda", "comunidad"], ["Collado Villalba", "Collado Villalba", "comunidad"], ["Rascafría", "Rascafría", "comunidad"],
  ["Tres Cantos", "Tres Cantos", "comunidad"], ["Colmenar Viejo", "Colmenar Viejo", "comunidad"], ["San Lorenzo de El Escorial", "El Escorial", "comunidad"],
];
const nombres = NOMBRES.map(([oficial, n, en]) => {
  const g = madrid.geometries.find((x) => x.properties.name === oficial);
  if (!g) throw new Error(`No hay ningún municipio llamado "${oficial}" en los datos del IGN`);
  const [x, y] = centro(feature(topo, g).geometry);
  return { n, x, y, en };
});

const salida = {
  fuente: "© Instituto Geográfico Nacional (CC BY 4.0)",
  proy: { lat0: LAT0, lon0: LON0, k: K, cos: Math.round(COS * 1e6) / 1e6 },
  caja, tierra, bordes, capital,
  nombres,
};
await writeFile("mapa-madrid.json", JSON.stringify(salida));
console.log(`mapa-madrid.json · ${madrid.geometries.length} municipios · ${(JSON.stringify(salida).length / 1024).toFixed(1)} KB · ${nombres.length} nombres`);
