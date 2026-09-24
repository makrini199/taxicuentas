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
| `CNAME` | El dominio propio: `txpro.app`. Lo lee GitHub Pages al desplegar. |
| `.nojekyll` | Desactiva Jekyll, que si no se saltaría la carpeta `.well-known/`. |
| `.well-known/` | Verificación del dominio para la app de Android. |
| `scripts/` | Utilidades sueltas que no forman parte de la app. |
| `store/` | Material gráfico de la ficha de Play Store. |

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

## El dominio

La app se publica en <https://txpro.app>, servida por GitHub Pages desde `main`.
Dos archivos de la raíz lo sostienen y conviene no borrarlos:

- **`CNAME`** le dice a GitHub qué dominio usar. Si desaparece, Pages vuelve a
  servir en `makrini199.github.io/taxicuentas` y la app instalada deja de abrir.
- **`.nojekyll`** apaga el procesado de Jekyll. Sin él, GitHub descarta las
  carpetas que empiezan por punto y `/.well-known/assetlinks.json` devolvería
  404, que es lo que vincula el dominio con la app de Play.

`https://txpro.app/.well-known/ok.txt` sirve para comprobar de un vistazo que
esa carpeta se está publicando.

## Vincular la app de Android

```bash
npm run assetlinks -- HUELLA_DE_SUBIDA HUELLA_DE_PLAY
```

Escribe `.well-known/assetlinks.json` con las huellas SHA-256 de firma. Hacen
falta las dos: la del `signing.keystore` y la que Google genera al volver a
firmar la app. El detalle completo está en `PLAY_STORE.md`.

## Capturas de la ficha

```bash
npm run capturas
```

Rehace las siete capturas de `store/screenshots/` a partir de la app servida en
local, con datos de ejemplo inventados. Hay que tener el servidor levantado.

## Los días fuertes de Madrid

`eventos.json` marca en el Calendario los días en que se hace caja: puentes,
Nochevieja, Reyes, partidos, ferias, conciertos. No hay API ni servidor: el
archivo se sirve desde el mismo sitio que la app, así que no hay clave que
robar y sin cobertura sigue valiendo lo último que se bajó.

**Para añadir fechas basta con editar el archivo y subirlo a `main`.** Como la
app de Play carga esta web por dentro, el cambio le llega a todo el mundo sin
pasar por Google ni generar un `.aab` nuevo.

```json
{ "fecha": "2026-11-21", "titulo": "Real Madrid · Celta", "lugar": "Bernabéu", "tipo": "futbol", "nota": "21:00. Salidas a partir de las 23:00." }
```

| campo | |
|---|---|
| `fecha` | `AAAA-MM-DD`, obligatoria |
| `titulo` | máx. 60 caracteres, obligatorio |
| `hasta` | opcional; para ferias y puentes marca todos los días del rango |
| `lugar` | opcional, máx. 40 |
| `tipo` | `fiesta`, `futbol`, `concierto`, `feria`, `ocio`, `deporte` |
| `nota` | opcional, máx. 160; lo útil va aquí (hora, por dónde salen) |

Antes de subirlo:

```
npm run eventos
```

Comprueba las fechas, los rangos absurdos, los repetidos y los campos que se
pasan de largo, e imprime el calendario con el día de la semana de cada fecha
para cazar el típico «el partido es el sábado» cuando cae en jueves. Avisa
también cuando quedan menos de 30 días de calendario por delante.

### De dónde salen las fechas

Las que hay ahora son las que no dependen de nadie: festivos, puentes, La
Almudena, Black Friday, la Navidad y Reyes. Las demás hay que mirarlas en la
fuente y apuntarlas a mano:

| | dónde |
|---|---|
| Real Madrid | realmadrid.com · calendario del primer equipo |
| Atlético | atleticodemadrid.com |
| Rayo, Getafe, Leganés | web de cada club |
| Baloncesto y conciertos | movistararena.es · calendario |
| Ferias | ifema.es/calendario |
| Carreras | hipodromodelazarzuela.es |
| Fabrik | fabrikoficial.com |
| Fiestas de los pueblos | web del ayuntamiento de cada municipio |

**No inventes una fecha que no hayas comprobado.** Un conductor que se planta
en el Bernabéu porque la app decía que había partido no vuelve a fiarse.

## Datos

Todo se guarda en `localStorage` del navegador:

| Clave | Contenido |
| --- | --- |
| `tc_days` | Los días registrados. |
| `tc_gastos` | Los gastos, el combustible incluido. |
| `tc_notas` | Las notas del calendario, una por día. |
| `tc_cfg` | El acuerdo del conductor: porcentaje e incentivo. |
| `tc_cfg_ok` | Si ya pasó por Ajustes, para no repetir el aviso inicial. |

Esto implica que **los datos no se sincronizan entre móviles** y que se pierden
si se borran los datos del navegador o se desinstala la app.
