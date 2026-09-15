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
  await set('Taxi', '142.30'); await set('Uber', '68.40'); await set('Uber efectivo', '18');
  await set('Cabify', '51.20'); await set('Bolt', '24.75'); await set('Bolt efectivo', '24.75');
  await set('FreeNow T9', '46.10'); await set('FreeNow T9 cobrado', '12'); await set('Tarjeta', '98.50');
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
  await p.getByRole('button', { name: 'Ajustes' }).click();
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
  await p.getByRole('button', { name: 'Ajustes' }).click();
  await p.waitForTimeout(400);
  const dl = p.waitForEvent('download', { timeout: 15000 });
  await p.getByRole('button', { name: 'Exportar copia' }).click();
  const d = await dl;
  await d.saveAs('/tmp/qa_copia.json');
  comprobar('nombre del archivo', d.suggestedFilename().startsWith('txpro-'), d.suggestedFilename());
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: 'load' });
  await p.waitForSelector('text=INGRESOS DEL DÍA');
  await p.getByRole('button', { name: 'Ajustes' }).click();
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

  console.log('\n— RESULTADO —');
  console.log('errores de consola:', errores.length ? errores : 'ninguno');
  console.log('comprobaciones fallidas:', fallos.length ? fallos : 'ninguna');
  await b.close();
  process.exit(fallos.length || errores.length ? 1 : 0);
})();
