// Compiles src/app.jsx to app.js, vendors React, and stamps the version
// everywhere it has to match. Run: npm run build
import { transform } from "esbuild";
import { readFile, writeFile, copyFile, mkdir } from "node:fs/promises";

const pkg = JSON.parse(await readFile("package.json", "utf8"));
const VERSION = pkg.version;

const source = await readFile("src/app.jsx", "utf8");
const { code, warnings } = await transform(source, {
  loader: "jsx",
  jsx: "transform",
  jsxFactory: "React.createElement",
  jsxFragment: "React.Fragment",
  target: "es2019",
  minify: true,
});
for (const w of warnings) console.warn("aviso:", w.text);

await writeFile("app.js", `/* TaxiCuentas ${VERSION} — generado por build.mjs, no editar a mano */\n${code.replace(/__APP_VERSION__/g, VERSION)}`);

await mkdir("vendor", { recursive: true });
await copyFile("node_modules/react/umd/react.production.min.js", "vendor/react.production.min.js");
await copyFile("node_modules/react-dom/umd/react-dom.production.min.js", "vendor/react-dom.production.min.js");

const sw = await readFile("src/sw.js", "utf8");
await writeFile("sw.js", sw.replace(/__APP_VERSION__/g, VERSION));

const manifest = JSON.parse(await readFile("src/manifest.webmanifest", "utf8"));
await writeFile("manifest.webmanifest", JSON.stringify(manifest, null, 2) + "\n");

console.log(`TaxiCuentas ${VERSION} · app.js ${(code.length / 1024).toFixed(1)} KB`);
