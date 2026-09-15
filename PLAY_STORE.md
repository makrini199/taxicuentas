# Publicar en Google Play

Guía para llevar TaxiCuentas Pro a Play Store. Todo esto se puede hacer desde
Windows: no hace falta Mac (eso sería para App Store, más adelante).

---

## 0. Antes de nada: dos huecos por rellenar

En `privacidad.html`, al final, hay dos marcadores que **hay que sustituir**:

- `COMPLETAR_NOMBRE_O_RAZON_SOCIAL`
- `COMPLETAR_CORREO_DE_CONTACTO`

Google exige un contacto real y verificable. **No conviene usar el correo
personal de siempre**, porque queda publicado: mejor crear uno del estilo
`taxicuentas.soporte@gmail.com` y usarlo también como correo de contacto en la
ficha de Play.

---

## 1. Cuenta de desarrollador

- Alta en <https://play.google.com/console>: **25 $ una sola vez**.
- Desde 2023 Google **verifica la identidad** del desarrollador (DNI y, si es
  cuenta de empresa, documentación de la sociedad). Tarda unos días.
- Si la cuenta es **personal**, Google pide además que la app la prueben
  **12 personas durante 14 días seguidos** antes de permitir la publicación
  abierta. Con una cuenta de **empresa** ese requisito no aplica.

> Los compañeros que ya usan la app sirven perfectamente como probadores. Vale
> la pena tenerlo en cuenta al elegir el tipo de cuenta.

---

## 2. Convertir la web en aplicación (TWA)

La app ya cumple los requisitos de PWA instalable, así que se envuelve en una
*Trusted Web Activity*: un contenedor de Android que abre la web a pantalla
completa, sin barra de navegador.

La vía más simple, sin instalar nada:

1. Ir a <https://www.pwabuilder.com>.
2. Pegar la URL pública de la app.
3. Revisar el informe (debería salir en verde: manifest, service worker, iconos).
4. **Package for stores → Android → Generate**.
5. Descargar el paquete. Dentro vienen:
   - `app-release-bundle.aab` — esto es lo que se sube a Play.
   - `signing.keystore` y `signing-key-info.txt` — **la clave de firma**.
   - `assetlinks.json` — para vincular la web con la app.

### ⚠️ La clave de firma

`signing.keystore` y su contraseña son **irreemplazables**. Si se pierden, no se
puede volver a actualizar la app nunca: habría que publicarla de cero con otro
nombre de paquete y los usuarios tendrían que reinstalarla. Guardar una copia en
sitio seguro y otra fuera del ordenador.

### Vincular la web con la app

Para que la app abra sin barra de navegador, hay que subir el archivo
`assetlinks.json` que genera PWABuilder a:

```
/.well-known/assetlinks.json
```

En este repositorio eso significa crear la carpeta `.well-known/` en la raíz con
ese archivo dentro, y volver a desplegar. Si este paso falta, la app funciona
igual pero se ve la barra de direcciones arriba, y eso desmerece bastante.

**Nombre de paquete sugerido:** `com.taxicuentas.app` (hay que fijarlo al generar
el paquete; después no se puede cambiar).

---

## 3. Ficha de Play Store

### Nombre de la aplicación (máx. 30 caracteres)

```
TaxiCuentas Pro
```

### Descripción breve (máx. 80 caracteres)

```
Lleva las cuentas de tu taxi: facturación, tu porcentaje y el efectivo del día.
```

### Descripción completa (máx. 4000 caracteres)

```
TaxiCuentas Pro es la libreta de cuentas para conductores de taxi y VTC. Apunta
lo que haces cada día y la app calcula sola lo que te toca a ti, lo que cobra la
empresa y el efectivo que llevas encima al terminar el turno.

CADA DÍA, EN UN MINUTO
Anota el taxímetro y lo facturado en cada plataforma. En las apps de viajes
tienes dos casillas: el total que has hecho con ellas y lo que has cobrado en
mano. La app deduce sola lo que se queda la empresa. Con la tarjeta y el
combustible, igual de fácil.

TU ACUERDO, NO EL DE OTRO
Cada empresa paga distinto, así que nada viene impuesto. En Ajustes pones tu
porcentaje sobre la facturación y, si tu empresa da algún extra al llegar a
cierto importe, lo configuras: un bono fijo en euros o un porcentaje del
combustible. Los números son los tuyos.

SABER CÓMO VAS
- Resumen del mes con tu media diaria y el balance con la empresa.
- Gráfico de facturación mes a mes, para ver la temporada de un vistazo.
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

TaxiCuentas Pro no está asociada a Uber, Cabify, Bolt ni FreeNow. Esos nombres
aparecen únicamente para identificar cada casilla.
```

### Otros campos

| Campo | Valor |
| --- | --- |
| Categoría | Finanzas (alternativa: Empresa) |
| Etiquetas | taxi, VTC, cuentas, facturación, conductor |
| Correo de contacto | el correo de soporte que se cree |
| Política de privacidad | `https://TU-DOMINIO/privacidad.html` |
| Clasificación de contenido | Para todos los públicos (el cuestionario sale limpio: sin violencia, sin compras, sin datos compartidos) |
| Anuncios | **No**, la app no contiene anuncios |

---

## 4. Formulario de seguridad de datos

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

---

## 5. Material gráfico

| Recurso | Requisito de Google | Estado |
| --- | --- | --- |
| Icono | 512 × 512 PNG | `icons/store-1024.png` (reescalar a 512) |
| Gráfico destacado | 1024 × 500 PNG | **Pendiente** |
| Capturas de teléfono | 2 a 8, mínimo 320 px de lado | **Pendientes** |

Para las capturas: van bien la pantalla de Diario con datos de un día real, el
resumen mensual con el gráfico y la pestaña de Periodo. Cuidado con no enseñar
cifras reales que no quieras publicar.

---

## 6. Publicar una actualización

1. Subir `version` en `package.json`.
2. `npm run build`.
3. Commit y push a `main`.

Como es una TWA, la app instalada carga la web: **el contenido se actualiza solo,
sin pasar por Play**. Solo hay que volver a generar y subir el `.aab` cuando
cambie algo del contenedor (el icono de Android, el nombre, los permisos), no en
cada cambio de la aplicación.

---

## Antes de darle a publicar

- [ ] Rellenados los dos marcadores de `privacidad.html`.
- [ ] `assetlinks.json` publicado en `/.well-known/` y comprobado.
- [ ] Copia de seguridad del `signing.keystore` en dos sitios distintos.
- [ ] La app abierta en un Android real, instalada desde la pantalla de inicio,
      probando un día completo y una copia de seguridad.
- [ ] Capturas hechas sin cifras que no quieras enseñar.
