# Publicar en Google Play

Guía para llevar TXpro a Play Store. Todo esto se puede hacer desde
Windows: no hace falta Mac (eso sería para App Store, más adelante).

---

## 0. El nombre, ya comprobado

Comprobado el 15 de septiembre de 2026, antes de fijar nada:

| Dónde | Qué se buscó | Resultado |
| --- | --- | --- |
| Google Play | «TXpro» | Existe una app «Tx Pro» de **alarmas y seguridad**, otra categoría. Sin conflicto de los que Play rechaza. |
| OEPM (España) | «TX pro» | Sin resultados. |
| EUIPO (Unión Europea) | «TX Pro» | Marca **registrada** nº 015118805, pero en **clases 17 y 19**: aislantes y materiales de construcción. No alcanza al software. |

Una marca protege los productos y servicios de las clases en que se registra.
Una app es **clase 9** (software descargable) y, si algún día hay servicio en la
nube, **clase 42**. Ninguna de las dos está tomada por esa marca.

El nombre anterior, *TaxiCuentas*, se descartó porque ya hay una app publicada
en Play con ese nombre exacto, la misma función y el mismo público. No estaba
registrada como marca, pero esa coincidencia basta para que Play rechace la
publicación, y además habría dejado la marca fuera del alcance: alguien llevaba
usándola públicamente desde 2016.

> **Si la app crece, conviene registrar TXpro en clase 9** (del orden de 150 €
> por clase en la OEPM). Que exista esa marca en las clases 17 y 19 no lo impide.

---

## 1. El dominio: `txpro.app`

El dominio está comprado en Porkbun. La app se sirve desde GitHub Pages, así que
hay que apuntar uno al otro. Son dos partes: **DNS en Porkbun** y **dominio en
GitHub**.

`.app` es un dominio con **HTTPS obligatorio**: está en la lista HSTS que los
navegadores llevan de fábrica, así que nadie podrá abrirlo por `http://` ni
aunque lo escriba a mano. Para una app es justo lo que interesa.

### 1.1 En Porkbun

Entrar en el panel del dominio → **DNS Records**.

**Primero, borrar lo que trae puesto.** Porkbun añade por su cuenta un registro
`ALIAS` (y a veces un `CNAME` de `www`) apuntando a su página de aparcamiento.
Mientras estén ahí, los registros nuevos no surten efecto. Hay que eliminarlos.

Después, crear estos **cuatro registros A**, todos con el host vacío (la raíz):

| Tipo | Host | Responde a | TTL |
| --- | --- | --- | --- |
| A | *(vacío)* | `185.199.108.153` | 600 |
| A | *(vacío)* | `185.199.109.153` | 600 |
| A | *(vacío)* | `185.199.110.153` | 600 |
| A | *(vacío)* | `185.199.111.153` | 600 |

Son las cuatro máquinas de GitHub Pages; se ponen las cuatro para que si una
falla la app siga abriendo.

Y uno más, para que `www.txpro.app` también lleve a la app:

| Tipo | Host | Responde a | TTL |
| --- | --- | --- | --- |
| CNAME | `www` | `makrini199.github.io` | 600 |

> Ese último valor **termina en punto o no según lo pida Porkbun**; si el panel
> se queja, probar con `makrini199.github.io.`

### 1.2 En GitHub

El archivo `CNAME` de este repositorio ya contiene `txpro.app`. GitHub lo lee
solo al desplegar, así que en cuanto esta rama se fusione en `main` el dominio
queda configurado sin tocar nada más.

Aun así conviene comprobarlo en **Settings → Pages** del repositorio:

- *Custom domain* debe decir `txpro.app`.
- Esperar a que salga el check verde de **DNS check successful** (desde unos
  minutos hasta unas horas, según tarde el DNS en propagarse).
- Cuando aparezca, marcar **Enforce HTTPS**. Si la casilla sale en gris, es que
  el certificado todavía se está emitiendo: hay que volver al rato.

### 1.3 Comprobar que funciona

Cuando el DNS haya propagado, estas tres direcciones tienen que abrir:

```
https://txpro.app/
https://txpro.app/privacidad.html
https://txpro.app/.well-known/ok.txt
```

La tercera es la importante y es fácil pasarla por alto. GitHub Pages pasa los
archivos por Jekyll, que **se salta las carpetas que empiezan por punto** — y la
verificación de la app va justamente en `/.well-known/`. Por eso el repositorio
lleva un archivo `.nojekyll` en la raíz, que desactiva ese filtro. Si
`ok.txt` responde, la carpeta se está sirviendo y el paso 2.3 funcionará.

---

## 2. Cuenta de desarrollador

Dada de alta el 15 de septiembre de 2026, pendiente de verificación.

| | |
| --- | --- |
| Cuenta de Google | `proyecto.txpro@gmail.com` |
| Tipo | **Personal** |
| Nombre de desarrollador (público) | **TXpro** |
| Sitio web declarado | `https://txpro.app` |
| Cuota | 25 $, pago único |

La cuenta queda **atada para siempre a esa cuenta de Google**: por eso se usa la
del proyecto y no una personal. El nombre de desarrollador es lo que Play
muestra bajo el nombre de la app, y es distinto del nombre del perfil de pagos,
que va a nombre de la persona porque Google lo cruza con el DNI y la tarjeta.

Se eligió personal y no de empresa porque la de organización exige una sociedad
constituida con número **D-U-N-S**, que es gratis pero puede tardar **hasta 30
días** en emitirse. Un autónomo no la puede pedir.

### Lo que falta

- **Verificación de identidad**: DNI por las dos caras. De unas horas a dos días
  laborables.
- **12 probadores durante 14 días seguidos**, requisito de las cuentas
  personales creadas después del 13 de noviembre de 2023. Tienen que ser
  personas reales con Android, apuntadas con su cuenta de Google; ni emuladores
  ni cuentas duplicadas cuentan. Si alguien se sale a mitad, el contador vuelve
  a empezar. Los mismos 12 valen para todas las versiones que se publiquen
  después.

> Los compañeros que ya usan la app sirven perfectamente como probadores, y esas
> dos semanas son rodaje real antes de abrirla a todo el gremio.

### Si algún día se cobra por la app

Al registrarse se declara **no ser «trader»**, porque la app es gratuita y no
genera ingresos. El día que haya suscripción esa respuesta cambia, y con ella
Google publica los datos de contacto del desarrollador en la ficha, dirección
incluida. Es una razón de peso para cobrar desde una sociedad y no a título
personal.

---

## 3. Convertir la web en aplicación (TWA)

La app ya cumple los requisitos de PWA instalable, así que se envuelve en una
*Trusted Web Activity*: un contenedor de Android que abre la web a pantalla
completa, sin barra de navegador.

La vía más simple, sin instalar nada:

1. Ir a <https://www.pwabuilder.com>.
2. Pegar **`https://txpro.app`**. (Hacerlo cuando el dominio ya funcione: si se
   genera el paquete apuntando a la dirección vieja de GitHub, después no se
   puede cambiar sin rehacerlo.)
3. Revisar el informe (debería salir en verde: manifest, service worker, iconos).
4. **Package for stores → Android → Generate**.
5. Antes de generar, fijar el **nombre de paquete**: `com.txpro.cuentas`.
   Esto **no se puede cambiar nunca más**; es la identidad de la app en Play.
6. Descargar el paquete. Dentro vienen:
   - `app-release-bundle.aab` — esto es lo que se sube a Play.
   - `signing.keystore` y `signing-key-info.txt` — **la clave de firma**.
   - `assetlinks.json` — para vincular la web con la app.

### 3.1 ⚠️ La clave de firma

`signing.keystore` y su contraseña son **irreemplazables**. Si se pierden, no se
puede volver a actualizar la app nunca: habría que publicarla de cero con otro
nombre de paquete y los usuarios tendrían que reinstalarla. Guardar una copia en
sitio seguro y otra fuera del ordenador.

### 3.2 Vincular la web con la app

Para que la app abra sin barra de direcciones, el dominio tiene que declarar a
qué aplicación pertenece. Eso va en `/.well-known/assetlinks.json`, y este
repositorio trae un guion que lo escribe:

```bash
npm run assetlinks -- HUELLA_DE_SUBIDA HUELLA_DE_PLAY
```

**Hacen falta las dos huellas SHA-256**, y aquí es donde falla casi todo el
mundo:

| Cuál | De dónde se saca |
| --- | --- |
| La de **subida** | `signing-key-info.txt`, dentro del paquete de PWABuilder |
| La de **firma de Play** | Play Console → *Configuración → Integridad de la aplicación → Firma de apps* → «Huella digital del certificado SHA-256» |

El motivo: al subir el `.aab`, Google vuelve a firmar la app con **su propia
clave** antes de repartirla. La huella que llega a los móviles es la segunda, no
la del keystore. Si solo se pone la primera, en el móvil de uno mismo funciona
(porque ahí está instalada la versión firmada con la clave de subida) pero a
todos los que la instalen desde Play les sale la barra de direcciones.

La segunda huella no existe hasta haber subido el primer `.aab`, así que el
orden real es: generar → subir a Play → copiar la huella de Play → ejecutar el
guion con las dos → commit y push.

Después, comprobar que responde:

```
https://txpro.app/.well-known/assetlinks.json
```

Y confirmar la verificación con la herramienta de Google:

```
https://developers.google.com/digital-asset-links/tools/generator
```

Si esto falta o está mal, la app funciona igual pero se ve la barra de
direcciones arriba, y eso desmerece bastante.

---

## 4. Ficha de Play Store

### Nombre de la aplicación (máx. 30 caracteres)

```
TXpro Cuentas del Taxi
```

### Descripción breve (máx. 80 caracteres)

```
Lleva las cuentas de tu taxi: facturación, tu porcentaje y el efectivo del día.
```

### Descripción completa (máx. 4000 caracteres)

```
TXpro es la libreta de cuentas para conductores de taxi y VTC. Apunta
lo que haces cada día y la app calcula sola lo que te toca a ti, lo que cobra la
empresa y el efectivo que llevas encima al terminar el turno.

CADA DÍA, EN UN MINUTO
Anota el taxímetro y lo facturado en cada plataforma. En las apps de viajes
tienes dos casillas: el total que has hecho con ellas y lo que has cobrado en
mano. La app deduce sola lo que se queda la empresa. Con la tarjeta, igual de
fácil.

SOLO LAS APPS QUE USES
Enciende Uber, Cabify, Bolt o FreeNow según con cuáles trabajes, y si usas otra
que no está en la lista, la añades tú escribiendo su nombre. El parte diario se
queda con lo tuyo y nada más. Apagar una no borra nada: lo que ya tengas
apuntado sigue contando en tus meses.

TU ACUERDO, NO EL DE OTRO
Cada empresa paga distinto, así que nada viene impuesto. En Ajustes pones tu
porcentaje sobre la facturación y, si tu empresa da algún extra al llegar a
cierto importe, lo configuras: un bono fijo en euros o un porcentaje del
combustible. Los números son los tuyos.

GASTOS QUE TE DEBEN
Pinchazos, ITV, lavados, taller, multas. Apuntas lo que pagas de tu bolsillo y
marcas lo que te devuelve la empresa; al cerrar el mes sabes exactamente cuánto
te tienen que reembolsar, sin discusiones.

SABER CÓMO VAS
- Resumen del mes con tu media diaria y el balance con la empresa.
- Gráfico de facturación mes a mes, para ver la temporada de un vistazo.
- Calendario del mes con lo facturado cada día y sitio para tus notas.
- Cualquier periodo a medida: una semana, del 1 al 22, lo que necesites, con una
  barra por día.
- Tabla día a día con el acumulado.

TUS CUENTAS SON TUYAS
Todo se guarda en tu teléfono. Sin registro, sin cuenta de usuario y sin enviar
nada a ningún servidor. Funciona entera sin cobertura, que en un parking
subterráneo se agradece. Y puedes exportar una copia de seguridad cuando
quieras, para no depender de un solo móvil.

SIN PUBLICIDAD NI SEGUIMIENTO
Ni anuncios, ni analítica, ni permisos raros. La app no pide ubicación, ni
cámara, ni contactos. No pide nada.

TXpro no está asociada a Uber, Cabify, Bolt ni FreeNow. Esos nombres
aparecen únicamente para identificar cada casilla.
```

### Otros campos

| Campo | Valor |
| --- | --- |
| Categoría | Finanzas (alternativa: Empresa) |
| Etiquetas | taxi, VTC, cuentas, facturación, conductor |
| Correo de contacto | `proyecto.txpro@gmail.com` |
| Sitio web | `https://txpro.app` |
| Política de privacidad | `https://txpro.app/privacidad.html` |
| Clasificación de contenido | Para todos los públicos (el cuestionario sale limpio: sin violencia, sin compras, sin datos compartidos) |
| Anuncios | **No**, la app no contiene anuncios |

---

## 5. Formulario de seguridad de datos

Google lo pregunta en Play Console y **hay que responderlo con exactitud**: una
respuesta que no cuadre con lo que hace la app es motivo de retirada.

| Pregunta | Respuesta |
| --- | --- |
| ¿La app recopila o comparte datos de usuario? | **No** |
| ¿Los datos se cifran en tránsito? | No procede (no se transmiten datos) |
| ¿Se pueden solicitar la eliminación de los datos? | No procede (se borran desinstalando) |

El motivo es real: los datos se guardan con `localStorage` en el propio
dispositivo y nunca salen de él. La app no lleva SDK de analítica, ni de
publicidad, ni ningún recurso externo (ni siquiera la tipografía, que se sirve
desde la propia app).

> Si algún día se añade sincronización en la nube, **este formulario y la
> política de privacidad hay que actualizarlos antes** de publicar esa versión.

---

## 6. Material gráfico

Todo listo en la carpeta `store/`:

| Recurso | Requisito de Google | Archivo |
| --- | --- | --- |
| Icono | 512 × 512 PNG | `store/icon-512.png` |
| Gráfico destacado | 1024 × 500 PNG | `store/feature-graphic.png` |
| Capturas de teléfono | 2 a 8, mínimo 320 px de lado | `store/screenshots/*.jpg` (8, a 1080 × 1920) |

Las ocho capturas salen de la aplicación real, con **datos de ejemplo inventados**:
no hay cifras de nadie ahí dentro. Están enmarcadas sobre fondo oscuro con un
titular cada una, que es como se presentan las fichas cuidadas.

| Archivo | Qué enseña |
| --- | --- |
| `01-diario` | El formulario del día, una casilla por plataforma |
| `02-calculo` | El cálculo: tu parte, la de la empresa y el efectivo |
| `03-gastos` | Los gastos del mes y lo que la empresa debe devolver |
| `04-calendario` | El mes coloreado por facturación |
| `05-mensual` | El gráfico mes a mes y la liquidación |
| `06-periodo` | Un periodo a medida con una barra por día |
| `07-ajustes` | El porcentaje y el incentivo configurables |
| `08-apps` | Los interruptores de cada plataforma y el alta de otras |

### Rehacerlas cuando cambie la interfaz

```bash
npm run build
python3 -m http.server 8080    # en otra terminal
npm run capturas
```

`scripts/capturas.mjs` siembra un mes y medio de trabajo inventado, fotografía
cada pantalla a 360 × 640 con densidad 3 y las compone con su titular. El
navegador va en español a propósito (`--lang=es-ES` más `LANG`/`LC_TIME`):
si no, los campos de fecha se dibujan en formato americano y eso en una ficha
española canta muchísimo.

---

## 7. Publicar una actualización

1. Subir `version` en `package.json`.
2. `npm run build`.
3. Commit y push a `main`.

Como es una TWA, la app instalada carga la web: **el contenido se actualiza solo,
sin pasar por Play**. Solo hay que volver a generar y subir el `.aab` cuando
cambie algo del contenedor (el icono de Android, el nombre, los permisos), no en
cada cambio de la aplicación.

---

## Antes de darle a publicar

- [ ] Identidad verificada en Play Console.
- [ ] 12 probadores apuntados y 14 días cumplidos.
- [ ] `https://txpro.app/` abre la app, con candado y sin aviso de certificado.
- [ ] `https://txpro.app/.well-known/ok.txt` responde (confirma que `.nojekyll`
      hace su trabajo).
- [ ] **Enforce HTTPS** marcado en Settings → Pages.
- [ ] `assetlinks.json` publicado **con las dos huellas** y validado con la
      herramienta de Google.
- [ ] Copia de seguridad del `signing.keystore` en dos sitios distintos.
- [ ] La app abierta en un Android real, instalada desde la pantalla de inicio,
      probando un día completo y una copia de seguridad.
- [ ] Capturas hechas sin cifras que no quieras enseñar.
