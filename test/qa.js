const { chromium } = require('playwright');
// Repaso completo de la app antes de publicar.
//
//   npm run build && npx serve -l 8080 .    (o: python3 -m http.server 8080)
//   node test/qa.js
//
// Recorre cada pestaña comprobando las cifras, guarda un día, añade un
// repostaje, cambia el acuerdo, exporta y restaura una copia, y verifica que
// todo sigue funcionando con la red cortada. Sale con código 1 si algo falla.
(async () => {
  const EJECUTABLE = process.env.CHROMIUM_PATH;  // opcional: navegador propio
  const b = await chromium.launch({ args: ['--lang=es-ES'], ...(EJECUTABLE ? { executablePath: EJECUTABLE } : {}) });
  const ctx = await b.newContext({ viewport: { width: 360, height: 700 }, deviceScaleFactor: 2, locale: 'es-ES', timezoneId: 'Europe/Madrid', acceptDownloads: true });
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', (e) => errores.push('PAGEERROR: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/favicon/i.test(m.text())) errores.push('CONSOLE: ' + m.text()); });
  const fallos = [];
  const comprobar = (nombre, ok, detalle) => { console.log((ok ? '  OK  ' : ' FALLO') + ' · ' + nombre + (detalle ? ' → ' + detalle : '')); if (!ok) fallos.push(nombre); };

  await p.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
  await p.waitForSelector('text=INGRESOS DEL DÍA');
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: 'load' });
  await p.waitForSelector('text=INGRESOS DEL DÍA');

  console.log('\n— ARRANQUE —');
  comprobar('aviso de configuración inicial', await p.getByText('Ajusta la app a tu acuerdo').count() > 0);
  comprobar('marca en la cabecera', (await p.locator('body').innerText()).includes('TXpro'));

  console.log('\n— DIARIO —');
  const set = async (l, v) => p.locator(`input[aria-label="${l}"]`).fill(v);
  await set('Taxímetro', '142.30'); await set('Uber', '68.40'); await set('Uber, cobrado en efectivo', '18');
  await set('Cabify', '51.20'); await set('Bolt', '24.75'); await set('Bolt, cobrado en efectivo', '24.75');
  await set('FreeNow · precio cerrado', '46.10'); await set('FreeNow · precio cerrado, ya cobrado', '12');
  await set('Tarjeta', '98.50');
  await p.waitForTimeout(400);
  // facturación = 142.30+68.40+51.20+24.75+46.10 = 332.75
  // cobrado = (68.40-18)+(51.20-0)+(24.75-24.75)+12+98.50 = 50.40+51.20+0+12+98.50 = 212.10
  const calc = await p.getByText('Cálculo del día').locator('..').innerText();
  comprobar('facturación del día', (await p.getByText('Total facturación día').locator('../..').innerText()).includes('332,75'));
  comprobar('50% del conductor', calc.includes('166,38'));
  comprobar('cobrado por empresa', calc.includes('212,10'));
  comprobar('efectivo del conductor', calc.includes('120,65'));
  await p.getByRole('button', { name: 'Guardar día' }).click();
  await p.waitForTimeout(500);
  comprobar('aviso de guardado', await p.getByText('Día guardado').count() > 0);

  console.log('\n— GASTOS —');
  await p.getByRole('button', { name: /Gastos/ }).click();
  await p.waitForTimeout(500);
  await p.locator('#gastoImporte').fill('318.40');   // Combustible viene elegido
  await p.getByRole('button', { name: 'Guardar gasto' }).click();
  await p.waitForTimeout(600);
  await p.getByRole('button', { name: 'Pinchazo', exact: true }).click();
  await p.locator('#gastoImporte').fill('45');
  comprobar('lo reembolsable viene marcado', await p.locator('#gastoReemb').isChecked());
  await p.getByRole('button', { name: 'Guardar gasto' }).click();
  await p.waitForTimeout(600);
  const gas = await p.locator('body').innerText();
  comprobar('gastos guardados', gas.includes('318,40') && gas.includes('45,00'));
  comprobar('total del mes', gas.includes('363,40'), '318,40 + 45');
  comprobar('lo que debe la empresa', /empresa te debe 45,00/.test(gas));

  console.log('\n— MENSUAL —');
  await p.getByRole('button', { name: /Mensual/ }).click();
  await p.waitForTimeout(600);
  const mes = await p.locator('body').innerText();
  comprobar('facturación del mes', mes.includes('332,75'));
  comprobar('gastos reflejados en el mes', mes.includes('363,40'));
  comprobar('gastos a devolver', mes.includes('45,00'));
  // facturación 332,75 · 50% = 166,375 · cobrado 212,10 → la empresa debe 45,725
  // más los 45 del pinchazo a devolver → 90,73
  comprobar('balance con los gastos a devolver', mes.includes('90,73'));
  comprobar('media diaria presente', /Media diaria \(1 día\)/.test(mes));
  comprobar('sin incentivo por defecto', !/[Bb]ono/.test(mes), 'no debe inventar acuerdos');

  console.log('\n— PERIODO —');
  await p.getByRole('button', { name: /Periodo/ }).click();
  await p.waitForTimeout(500);
  await p.getByRole('button', { name: 'Este mes' }).click();
  await p.waitForTimeout(600);
  const per = await p.locator('body').innerText();
  comprobar('total del periodo', per.includes('332,75'));
  comprobar('un día trabajado', /1 día trabajado/.test(per));

  console.log('\n— AJUSTES —');
  await p.getByLabel('Ajustes').click();
  await p.waitForTimeout(500);
  await p.locator('input[aria-label="Porcentaje del conductor"]').fill('45');
  await p.getByRole('button', { name: '% combustible' }).click();
  await p.locator('input[aria-label="Umbral de facturación"]').fill('300');
  await p.locator('input[aria-label="Porcentaje del combustible"]').fill('30');
  await p.waitForTimeout(500);
  const aj = await p.getByText('Así queda tu acuerdo').locator('..').innerText();
  comprobar('resumen del acuerdo', aj.includes('45%') && aj.includes('300') && aj.includes('30%'));
  await p.getByRole('button', { name: /Mensual/ }).click();
  await p.waitForTimeout(600);
  const mes2 = await p.locator('body').innerText();
  // 332.75 supera 300 → 30% de 318.40 = 95.52 ; 45% de 332.75 = 149.74
  comprobar('porcentaje aplicado al mes', mes2.includes('149,74'));
  comprobar('incentivo de combustible', mes2.includes('95,52'), '30% de 318,40');

  console.log('\n— COPIA DE SEGURIDAD —');
  await p.getByLabel('Ajustes').click();
  await p.waitForTimeout(400);
  const dl = p.waitForEvent('download', { timeout: 15000 });
  await p.getByRole('button', { name: 'Exportar copia' }).click();
  const d = await dl;
  await d.saveAs('/tmp/qa_copia.json');
  comprobar('nombre del archivo', d.suggestedFilename().startsWith('txpro-'), d.suggestedFilename());
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: 'load' });
  await p.waitForSelector('text=INGRESOS DEL DÍA');
  await p.getByLabel('Ajustes').click();
  await p.waitForTimeout(400);
  await p.locator('#tcImport').setInputFiles('/tmp/qa_copia.json');
  await p.waitForTimeout(600);
  await p.getByRole('button', { name: 'Restaurar', exact: true }).click();
  await p.waitForTimeout(700);
  const rest = await p.getByText('Así queda tu acuerdo').locator('..').innerText();
  comprobar('acuerdo restaurado', rest.includes('45%'));
  await p.getByRole('button', { name: /Mensual/ }).click();
  await p.waitForTimeout(600);
  comprobar('datos restaurados', (await p.locator('body').innerText()).includes('332,75'));

  console.log('\n— CON QUÉ APLICACIONES TRABAJA CADA UNO —');
  // Lo delicado de esto no es que la casilla aparezca o desaparezca, es que
  // apagar una plataforma no puede hacer que sus meses dejen de cuadrar.
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('tc_cfg_ok', 'true'); });
  await p.reload({ waitUntil: 'load' });
  await p.waitForSelector('text=INGRESOS DEL DÍA');
  for (const n of ['Uber', 'Cabify', 'Bolt', 'FreeNow · precio cerrado'])
    comprobar(`${n} viene de serie`, await p.locator(`input[aria-label="${n}"]`).count() === 1);

  await set('Taxímetro', '100'); await set('Bolt', '50'); await set('Bolt, cobrado en efectivo', '20');
  await p.waitForTimeout(300);
  await p.getByRole('button', { name: 'Guardar día' }).click();
  await p.waitForTimeout(500);

  await p.getByLabel('Ajustes').click();
  await p.waitForTimeout(600);
  await p.getByRole('switch', { name: 'Bolt' }).click();
  await p.waitForTimeout(500);
  await p.getByRole('button', { name: /Diario/ }).click();
  await p.waitForTimeout(600);
  comprobar('apagada desaparece del parte', await p.locator('input[aria-label="Bolt"]').count() === 0);
  comprobar('las demás siguen', await p.locator('input[aria-label="Uber"]').count() === 1);
  await p.getByRole('button', { name: /Mensual/ }).click();
  await p.waitForTimeout(700);
  comprobar('apagarla NO borra sus cuentas', (await p.locator('body').innerText()).includes('150,00'), '100 + 50 de Bolt');

  await p.getByLabel('Ajustes').click();
  await p.waitForTimeout(600);
  await p.locator('#appNueva').fill('RTI');
  await p.getByRole('button', { name: 'Añadir aplicación' }).click();
  await p.waitForTimeout(600);
  await p.getByRole('button', { name: /Diario/ }).click();
  await p.waitForTimeout(600);
  comprobar('la propia sale en el parte', await p.locator('input[aria-label="RTI"]').count() === 1);
  await set('RTI', '80'); await set('RTI, cobrado en efectivo', '30');
  await p.waitForTimeout(400);
  const propia = await p.getByText('Cálculo del día').locator('..').innerText();
  comprobar('la propia suma a la facturación', (await p.locator('body').innerText()).includes('230,00'), '100 + 50 + 80');
  comprobar('y la empresa cobra su parte', propia.includes('80,00'), '(50−20) + (80−30)');
  await p.getByRole('button', { name: 'Guardar día' }).click();
  await p.waitForTimeout(600);

  await p.getByLabel('Ajustes').click();
  await p.waitForTimeout(600);
  comprobar('no se puede quitar una con cifras dentro', await p.getByRole('button', { name: 'Quitar RTI' }).count() === 0);

  console.log('\n— SIN CONEXIÓN —');
  await p.waitForTimeout(1500);
  await ctx.setOffline(true);
  await p.reload({ waitUntil: 'load' });
  const offline = await p.waitForSelector('text=INGRESOS DEL DÍA', { timeout: 8000 }).then(() => true).catch(() => false);
  comprobar('la app abre sin red', offline);
  const pol = await ctx.newPage();
  const polOk = await pol.goto('http://localhost:8080/privacidad.html', { waitUntil: 'load' }).then(() => pol.locator('h1').innerText()).catch(() => null);
  comprobar('política accesible sin red', polOk === 'Política de privacidad');
  await ctx.setOffline(false);

  console.log('\n— DÍAS FUERTES DE MADRID —');
  await p.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
  await p.waitForSelector('text=INGRESOS DEL DÍA');
  await p.getByRole('button', { name: /Calendario/ }).click();
  await p.waitForTimeout(800);
  // El calendario arranca en el mes de hoy; hay que plantarse en diciembre.
  const irAlMes = async (ym) => {
    for (let i = 0; i < 24; i++) {
      const cab = await p.locator('body').innerText();
      if (new RegExp(ym, 'i').test(cab)) return true;
      await p.getByLabel('Mes siguiente').click();
      await p.waitForTimeout(200);
    }
    return false;
  };
  comprobar('se llega a diciembre', await irAlMes('diciembre de 2026'));
  const dic = await p.locator('body').innerText();
  comprobar('lista los días fuertes del mes', /d[ÍI]as fuertes del mes/i.test(dic));
  comprobar('sale Nochevieja', dic.includes('Nochevieja'));
  comprobar('sale el puente de diciembre', /Puente de la Constituci/.test(dic));
  await p.getByText('Nochevieja').first().click();
  await p.waitForTimeout(400);
  comprobar('al pulsarlo cuenta lo que hay', (await p.locator('body').innerText()).includes('La noche del año'));

  // Una feria ocupa varios días: el puente va del 5 al 8, y el 7 no está escrito
  // en ninguna parte del archivo, sale de abrir el rango.
  await p.getByRole('button', { name: /^2026-12-07/ }).click();
  await p.waitForTimeout(400);
  comprobar('un rango marca también los días de en medio', (await p.locator('body').innerText()).includes('Puente de la Constitución'));

  // Las horas: lo que importa es cuándo sale la gente. Y lo de pasada la
  // medianoche se apunta la noche en que pasa, así que el jueves 1 tiene que
  // enseñar primero Placebo (23:45) y luego Grupo Niche (00:00, de madrugada).
  await p.getByLabel('Mes anterior').click(); await p.waitForTimeout(150);
  await p.getByLabel('Mes anterior').click(); await p.waitForTimeout(150);
  comprobar('se vuelve a octubre', /octubre de 2026/i.test(await p.locator('body').innerText()));
  await p.getByRole('button', { name: /^2026-10-01/ }).click();
  await p.waitForTimeout(400);
  const jue = await p.locator('body').innerText();
  comprobar('enseña la salida', jue.includes('Salida 23:45 – 00:45'));
  comprobar('avisa de que es de madrugada', /Salida 00:00 – 01:00 · ya de madrugada/.test(jue));
  comprobar('lo de las 00:00 va detrás de lo de las 23:45', jue.indexOf('Placebo') > -1 && jue.indexOf('Placebo') < jue.indexOf('Grupo Niche'));
  // Un fin de semana de Shakira y un concierto el mismo viernes: primero lo
  // que dura todo el fin de semana, luego lo que tiene hora.
  await p.getByRole('button', { name: /^2026-10-02/ }).click();
  await p.waitForTimeout(400);
  const vie = await p.locator('body').innerText();
  comprobar('lo de todo el día va primero', vie.indexOf('Shakira') > -1 && vie.indexOf('Shakira') < vie.indexOf('Evanescence'));

  const guardado = await p.evaluate(() => localStorage.getItem('tc_eventos'));
  comprobar('el calendario queda guardado en el móvil', !!guardado && guardado.includes('Nochevieja'));

  console.log('\n— EL CALENDARIO NUNCA PUEDE TIRAR LA APP —');
  // Si algún día se sube un eventos.json mal hecho, la app tiene que abrir
  // igual y sin inventarse días. Se prueba sirviendo basura a propósito.
  const roto = await b.newContext({ viewport: { width: 360, height: 700 }, locale: 'es-ES' });
  await roto.route('**/eventos.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ eventos: [{ fecha: 'mañana', titulo: 7 }, { titulo: 'sin fecha' }, 'ni siquiera es un objeto', null] }) }));
  const pr = await roto.newPage();
  const errRoto = [];
  pr.on('pageerror', (e) => errRoto.push(e.message));
  await pr.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
  const abreRoto = await pr.waitForSelector('text=INGRESOS DEL DÍA', { timeout: 8000 }).then(() => true).catch(() => false);
  comprobar('la app abre con el calendario roto', abreRoto);
  await pr.getByRole('button', { name: /Calendario/ }).click();
  await pr.waitForTimeout(600);
  comprobar('y no se inventa ningún día', !/d[ÍI]as fuertes del mes/i.test(await pr.locator('body').innerText()));
  comprobar('sin reventar por dentro', errRoto.length === 0, errRoto.join(' | '));
  await roto.close();

  // El orden dentro del día no puede depender de cómo esté escrito el archivo:
  // se sirve al revés y aun así tiene que salir 23:45 antes que 00:00.
  const reves = await b.newContext({ viewport: { width: 360, height: 700 }, locale: 'es-ES' });
  await reves.route('**/eventos.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ actualizado: '2026-09-24', eventos: [
    { fecha: '2026-10-01', titulo: 'Madrugada', salida: '00:30-01:30' },
    { fecha: '2026-10-01', titulo: 'Noche', salida: '23:15-00:15' },
    { fecha: '2026-10-01', titulo: 'Tarde', hora: '18:00' },
    { fecha: '2026-10-01', titulo: 'Todo el día' },
  ] }) }));
  const pv = await reves.newPage();
  const abrirJueves = async () => {
    await pv.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
    await pv.waitForSelector('text=INGRESOS DEL DÍA');
    await pv.waitForTimeout(700);
    await pv.getByRole('button', { name: /Calendario/ }).click();
    await pv.waitForTimeout(400);
    for (let i = 0; i < 24 && !/octubre de 2026/i.test(await pv.locator('body').innerText()); i++) { await pv.getByLabel('Mes siguiente').click(); await pv.waitForTimeout(120); }
    await pv.getByRole('button', { name: /^2026-10-01/ }).click();
    await pv.waitForTimeout(400);
    return pv.locator('body').innerText();
  };
  const orden = (t) => ['Todo el día', 'Tarde', 'Noche', 'Madrugada'].map((x) => t.indexOf(x));
  const enOrden = (t) => { const o = orden(t); return o.every((v) => v > -1) && o.every((v, i) => i === 0 || o[i - 1] < v); };
  const primera = await abrirJueves();
  comprobar('ordena por hora aunque el archivo venga al revés', enOrden(primera), orden(primera).join(' '));
  comprobar('"hora" sola dice cuándo empieza', primera.includes('Empieza a las 18:00'));
  // Segunda apertura: ya no hay descarga, sale de lo guardado en el móvil.
  const segunda = await abrirJueves();
  comprobar('las horas siguen al volver a abrir', segunda.includes('Salida 00:30 – 01:30 · ya de madrugada') && enOrden(segunda));
  await reves.close();

  // Y si no hay red, vale lo último que se bajó.
  const sinRed = await b.newContext({ viewport: { width: 360, height: 700 }, locale: 'es-ES' });
  const ps = await sinRed.newPage();
  await ps.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
  await ps.waitForSelector('text=INGRESOS DEL DÍA');
  await ps.waitForTimeout(1200);
  await sinRed.setOffline(true);
  await ps.reload({ waitUntil: 'load' });
  await ps.waitForSelector('text=INGRESOS DEL DÍA', { timeout: 8000 });
  await ps.getByRole('button', { name: /Calendario/ }).click();
  await ps.waitForTimeout(600);
  for (let i = 0; i < 24 && !/diciembre de 2026/i.test(await ps.locator('body').innerText()); i++) { await ps.getByLabel('Mes siguiente').click(); await ps.waitForTimeout(150); }
  comprobar('los días fuertes siguen ahí sin cobertura', (await ps.locator('body').innerText()).includes('Nochevieja'));
  await sinRed.close();

  console.log('\n— AVISO DE INSTALAR LA APP —');
  // Solo debe salir a quien esté en la web desde Android. Ni en la app ya
  // instalada, ni en iPhone (allí no hay nada que bajar de Play Store).
  const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
  const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
  const abrirComo = async (userAgent, initScript) => {
    const c = await b.newContext({ viewport: { width: 360, height: 700 }, locale: 'es-ES', userAgent });
    if (initScript) await c.addInitScript(initScript);
    const pg = await c.newPage();
    await pg.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
    await pg.waitForSelector('text=INGRESOS DEL DÍA');
    return { c, pg };
  };
  const seVe = (pg) => pg.getByText('Estás usando la versión web').count().then((n) => n > 0);

  const web = await abrirComo(ANDROID_UA);
  comprobar('sale en la web desde Android', await seVe(web.pg));
  const destino = await web.pg.getByRole('link', { name: 'Instalar la app' }).getAttribute('href');
  comprobar('lleva al alta de probadores', destino === 'https://play.google.com/apps/testing/com.txpro.cuentas', destino);
  await web.pg.getByRole('button', { name: 'Más tarde' }).click();
  await web.pg.waitForTimeout(300);
  comprobar('"Más tarde" lo cierra', !(await seVe(web.pg)));
  await web.pg.reload({ waitUntil: 'load' });
  await web.pg.waitForSelector('text=INGRESOS DEL DÍA');
  comprobar('y no vuelve al recargar', !(await seVe(web.pg)));
  await web.c.close();

  // La app instalada carga esta misma web por dentro: allí nunca debe salir.
  const standalone = 'window.matchMedia = (q) => ({ matches: /display-mode: standalone/.test(q), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });';
  const app = await abrirComo(ANDROID_UA, standalone);
  comprobar('no sale dentro de la app instalada', !(await seVe(app.pg)));
  await app.c.close();

  const iphone = await abrirComo(IPHONE_UA);
  comprobar('no sale en iPhone', !(await seVe(iphone.pg)));
  await iphone.c.close();

  console.log('\n— RESULTADO —');
  console.log('errores de consola:', errores.length ? errores : 'ninguno');
  console.log('comprobaciones fallidas:', fallos.length ? fallos : 'ninguna');
  await b.close();
  process.exit(fallos.length || errores.length ? 1 : 0);
})();
