# TXpro

Liquidaciones diarias y mensuales para conductores de taxi y VTC. Apunta lo
facturado en el taxímetro y en cada app, y calcula tu parte, lo que cobra la
empresa y el efectivo que llevas encima.

La app funciona sin conexión y **no envía datos a ningún sitio**: todo lo que
apuntas se queda en el navegador del propio móvil.

## Estructura

| Ruta | Qué es |
| --- | --- |
| `src/app.jsx` | La aplicación. **Este es el archivo que se edita.** |
| `src/sw.js` | Service worker (caché y actualizaciones). |
| `src/manifest.webmanifest` | Metadatos de app instalable. |
| `app.js`, `sw.js`, `manifest.webmanifest` | Generados por el build. No editar a mano. |
| `vendor/` | React y ReactDOM, copiados de `node_modules` en el build. |
| `icons/` | Iconos generados a partir del logo. |
| `index.html` | Shell: carga React, la app y registra el service worker. |

Los archivos generados se suben al repositorio a propósito, para que GitHub
Pages sirva la app sin necesidad de compilar nada en el servidor.

## Compilar

```bash
npm install
npm run build
```

`build.mjs` compila el JSX con esbuild, copia React a `vendor/` y estampa la
versión de `package.json` en `app.js` y en el nombre de la caché del service
worker.

## Comprobar antes de publicar

```bash
npm run build
python3 -m http.server 8080    # en otra terminal
npm run qa
```

`test/qa.js` recorre la app entera en un navegador de verdad: mete un día y
comprueba las cifras, añade un repostaje, cambia el acuerdo, exporta y restaura
una copia de seguridad, y verifica que todo sigue funcionando con la red
cortada. Falla con código 1 si algo no cuadra.

Si Playwright no encuentra navegador, se le puede indicar uno con
`CHROMIUM_PATH=/ruta/al/chromium npm run qa`.

## Publicar una versión

1. Subir el número de `version` en `package.json`.
2. `npm run build`.
3. Commit y push a `main`.

El cambio de versión renueva el nombre de la caché, así que los móviles que ya
tengan la app instalada descargan la versión nueva y muestran el aviso
«Hay una versión nueva» con un botón para aplicarla. Nunca se recarga sola
mientras se está escribiendo.

## Datos

Todo se guarda en `localStorage` del navegador:

| Clave | Contenido |
| --- | --- |
| `tc_days` | Los días registrados. |
| `tc_gastos` | Los gastos, el combustible incluido. |
| `tc_cfg` | El acuerdo del conductor: porcentaje e incentivo. |
| `tc_cfg_ok` | Si ya pasó por Ajustes, para no repetir el aviso inicial. |

Esto implica que **los datos no se sincronizan entre móviles** y que se pierden
si se borran los datos del navegador o se desinstala la app.
