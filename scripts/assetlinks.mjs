// Escribe .well-known/assetlinks.json con las huellas de firma de la app
// Android, que es lo que vincula txpro.app con el paquete de Play y hace que
// la app abra sin la barra de direcciones del navegador.
//
//   npm run assetlinks -- AA:BB:...:FF            (una huella)
//   npm run assetlinks -- AA:BB:...:FF CC:DD:...  (subida + firma de Play)
//
// Hacen falta LAS DOS huellas: la de `signing.keystore` (la clave de subida,
// que sale en signing-key-info.txt de PWABuilder) y la que Google genera al
// firmar la app por su cuenta (Play Console → Configuración → Integridad de
// la aplicación → Huella SHA-256 del certificado). Con una sola, la
// verificación falla en los móviles que instalan desde Play.

import { writeFile, mkdir } from "node:fs/promises";

const PAQUETE = "com.txpro.cuentas";
const DESTINO = ".well-known/assetlinks.json";

const limpia = (h) => h.trim().toUpperCase().replace(/\s/g, "");
const valida = (h) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(h);

const huellas = [...new Set(process.argv.slice(2).map(limpia))].filter(Boolean);

if (!huellas.length) {
  console.error(`Falta la huella SHA-256.

  npm run assetlinks -- AA:BB:CC:...:FF

Son 32 pares hexadecimales separados por dos puntos. Se copia tal cual de
signing-key-info.txt o de Play Console.`);
  process.exit(1);
}

const malas = huellas.filter((h) => !valida(h));
if (malas.length) {
  console.error("Estas huellas no tienen el formato esperado (32 pares hex separados por «:»):");
  for (const h of malas) console.error("  " + h);
  console.error("\nOjo: la huella SHA-1 es más corta y no sirve. Tiene que ser la SHA-256.");
  process.exit(1);
}

const contenido = [
  {
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: PAQUETE,
      sha256_cert_fingerprints: huellas,
    },
  },
];

await mkdir(".well-known", { recursive: true });
await writeFile(DESTINO, JSON.stringify(contenido, null, 2) + "\n");

console.log(`${DESTINO} escrito · paquete ${PAQUETE} · ${huellas.length} huella${huellas.length > 1 ? "s" : ""}`);
if (huellas.length === 1) {
  console.log("\nAviso: solo hay una huella. Si la app ya está subida a Play, añade\ntambién la del certificado de firma de Google o no se verificará.");
}
console.log("\nDespués: npm run build, commit y push. Comprobar que responde en\nhttps://txpro.app/.well-known/assetlinks.json");
