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
  // Quien abre la app por primera vez elige entre conductor y empresa. Casi todas
  // las pruebas son del conductor, así que entran ya como tal; las de la entrada
  // y la empresa usan contextoNuevo, sin nada puesto.
  const contextoNuevo = b.newContext.bind(b);
  b.newContext = async (o) => { const c = await contextoNuevo(o); await c.addInitScript(() => { try { if (!localStorage.getItem('tc_rol')) localStorage.setItem('tc_rol', JSON.stringify('conductor')); } catch {} }); return c; };
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

  // El Diario pliega lo que se toca poco: el cálculo con la empresa y la jornada.
  const abrir = async (pg, nombre) => { const bt = pg.getByRole('button', { name: nombre }).first(); if ((await bt.getAttribute('aria-expanded')) === 'false') { await bt.click(); await pg.waitForTimeout(150); } };
  const abrirTodo = async (pg) => { await abrir(pg, /Cálculo con la empresa/); await abrir(pg, /^Tu jornada/); };
  // Lleva el Calendario a un mes concreto, esté antes o después del de hoy.
  const irAMes = async (pg, ym) => {
    const nombre = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5)) - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    const h = new Date(); const boton = ym < `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}` ? 'Mes anterior' : 'Mes siguiente';
    for (let i = 0; i < 36 && !(await pg.locator('body').innerText()).toLowerCase().includes(nombre); i++) { await pg.getByLabel(boton).click(); await pg.waitForTimeout(120); }
  };
  const hoyTxt = (pg) => pg.locator('[aria-label="Resumen del día"]').innerText();
  const jornadaTxt = (pg) => pg.getByRole('button', { name: /^Tu jornada/ }).locator('..').innerText();

  console.log('\n— ARRANQUE —');
  comprobar('aviso de configuración inicial', await p.getByText('Ajusta la app a tu acuerdo').count() > 0);
  comprobar('marca en la cabecera', (await p.locator('body').innerText()).includes('TXpro'));

  console.log('\n— DIARIO —');
  const set = async (l, v) => p.locator(`input[aria-label="${l}"]`).fill(v);
  await set('Taxímetro', '142.30'); await set('Uber', '68.40'); await set('Uber, cobrado en efectivo', '18');
  await set('Cabify', '51.20'); await set('Bolt', '24.75'); await set('Bolt, cobrado en efectivo', '24.75');
  await set('FreeNow · precio cerrado', '46.10'); await set('FreeNow · precio cerrado, ya cobrado', '12');
  comprobar('lo plegado empieza cerrado', (await p.getByText('Cálculo del día').count()) === 0 && (await p.getByLabel('Hora de empezar').count()) === 0);
  // Tarjeta y efectivo del taxímetro van enlazados. Sin tarjeta, todo el
  // taxímetro es efectivo. Con el cierre del datáfono (98,50), el efectivo es lo
  // que falta: 142,30 − 98,50 = 43,80.
  const efecTaxi = p.locator('input[aria-label="Taxímetro, cobrado en efectivo"]');
  const tarjetaTaxi = p.locator('input[aria-label="Tarjeta"]');
  comprobar('sin tarjeta, todo el taxímetro es efectivo', (await efecTaxi.inputValue()) === '142.3', await efecTaxi.inputValue());
  await set('Tarjeta', '98.50');
  await p.waitForTimeout(300);
  comprobar('con la tarjeta puesta, el efectivo es lo que falta', (await efecTaxi.inputValue()) === '43.8', await efecTaxi.inputValue());
  // Al revés: quien apunta el efectivo ve calcularse la tarjeta, y si luego
  // corrige el taxímetro, la tarjeta se recalcula.
  await set('Taxímetro, cobrado en efectivo', '40');
  await p.waitForTimeout(200);
  comprobar('con el efectivo puesto, la tarjeta se calcula', (await tarjetaTaxi.inputValue()) === '102.3', await tarjetaTaxi.inputValue());
  await set('Taxímetro', '150'); await p.waitForTimeout(200);
  comprobar('y sigue al taxímetro si cambia', (await tarjetaTaxi.inputValue()) === '110', await tarjetaTaxi.inputValue());
  await set('Taxímetro', '142.30'); await set('Tarjeta', '98.50');
  await p.waitForTimeout(400);
  comprobar('vuelve a mandar la tarjeta al escribirla', (await efecTaxi.inputValue()) === '43.8', await efecTaxi.inputValue());
  await abrirTodo(p);
  // facturación = 142.30+68.40+51.20+24.75+46.10 = 332.75
  // cobrado = (68.40-18)+(51.20-0)+(24.75-24.75)+12+98.50 = 50.40+51.20+0+12+98.50 = 212.10
  const calc = await p.getByText('Cálculo del día').locator('..').innerText();
  comprobar('facturación del día', (await hoyTxt(p)).includes('332,75'));
  comprobar('50% del conductor', calc.includes('166,38'));
  comprobar('cobrado por empresa', calc.includes('212,10'));
  comprobar('efectivo del conductor', calc.includes('120,65'));

  console.log('\n— TU JORNADA —');
  // De 18:00 a 04:00: pasa la medianoche y son 10 horas, no -14.
  await p.getByLabel('Hora de empezar').fill('18:00');
  await p.getByLabel('Hora de terminar').fill('04:00');
  await set('Número de carreras', '20');
  await set('Propinas', '12.50');
  await p.waitForTimeout(400);
  // Las propinas son del conductor: ni facturación, ni 50%, ni lo que cobra la
  // empresa pueden moverse un céntimo.
  const calc2 = await p.getByText('Cálculo del día').locator('..').innerText();
  comprobar('las propinas no entran en la facturación', (await hoyTxt(p)).includes('332,75'));
  comprobar('ni en el 50% ni en lo cobrado', calc2.includes('166,38') && calc2.includes('212,10') && calc2.includes('120,65'));
  const jor = await jornadaTxt(p);
  comprobar('jornada que pasa la medianoche', jor.includes('10 h (pasas la medianoche)'), jor.split('\n').pop());
  // (166,375 de tu 50% + 12,50 de propinas) / 10 h = 17,8875
  comprobar('lo que ganas por hora', /ganas 17,89\s€\/h/.test(jor));
  // 332,75 / 20 carreras = 16,6375
  comprobar('media por carrera', /16,64\s€ por carrera/.test(jor));
  // El combustible se apunta ahora en el día (antes, en Gastos). Dos repostajes.
  const comb = p.locator('input[aria-label="Combustible"]');
  await comb.fill('200+118,40');
  await comb.press('Enter');
  await p.waitForTimeout(200);
  comprobar('combustible del día con calculadora', (await comb.inputValue()) === '318.4', await comb.inputValue());
  const calc3 = await p.getByText('Cálculo del día').locator('..').innerText();
  comprobar('el combustible no toca la liquidación del día', calc3.includes('166,38') && calc3.includes('212,10') && calc3.includes('120,65'));
  await p.getByRole('button', { name: 'Guardar día' }).click();
  await p.waitForTimeout(500);
  comprobar('aviso de guardado', await p.getByText('Día guardado').count() > 0);

  console.log('\n— GASTOS —');
  await p.getByRole('button', { name: /Gastos/ }).click();
  await p.waitForTimeout(500);
  comprobar('en Gastos ya no se apunta combustible', (await p.getByRole('button', { name: 'Combustible', exact: true }).count()) === 0);
  await p.getByRole('button', { name: 'Pinchazo', exact: true }).click();
  await p.locator('#gastoImporte').fill('45');
  comprobar('lo reembolsable viene marcado', await p.locator('#gastoReemb').isChecked());
  await p.getByRole('button', { name: 'Guardar gasto' }).click();
  await p.waitForTimeout(600);
  const gas = await p.locator('body').innerText();
  comprobar('gastos guardados', gas.includes('318,40') && gas.includes('45,00'));
  comprobar('el combustible del Diario sale en su mes', gas.includes('Apuntado día a día en el Diario'));
  comprobar('total del mes', gas.includes('363,40'), '318,40 + 45');
  comprobar('lo que debe la empresa', /empresa te debe 45,00/.test(gas));

  console.log('\n— RESUMEN · MES —');
  await p.getByRole('button', { name: /Resumen/ }).click(); await p.getByRole('button', { name: 'Mes', exact: true }).click();
  await p.waitForTimeout(600);
  const mes = await p.locator('body').innerText();
  comprobar('facturación del mes', mes.includes('332,75'));
  comprobar('gastos reflejados en el mes', mes.includes('363,40'));
  comprobar('gastos a devolver', mes.includes('45,00'));
  // facturación 332,75 · 50% = 166,375 · cobrado 212,10 → la empresa debe 45,725
  // más los 45 del pinchazo a devolver → 90,73
  comprobar('balance con los gastos a devolver', mes.includes('90,73'));
  comprobar('media diaria presente', /1 día · media 333\s€ al día/.test(mes));
  comprobar('horas del mes', /Horas trabajadas \(1 día\)\s+10 h/.test(mes));
  comprobar('carreras del mes', /Carreras\s+20/.test(mes));
  comprobar('propinas del mes', /Propinas \(enteras para ti\)\s+12,50/.test(mes));
  comprobar('por hora en el mes', /Ganas por hora\s+17,89\s€\/h/.test(mes));
  comprobar('sin incentivo por defecto', !/[Bb]ono/.test(mes), 'no debe inventar acuerdos');

  console.log('\n— DESGLOSE —');
  // Lo que pregunta la empresa: cuánto de cada cosa. Mismo día de antes:
  // efectivo del taxímetro = 142,30 − 98,50 de tarjeta = 43,80;
  // FreeNow cerrado: 46,10 − 12 ya cobrado = 34,10 en efectivo.
  const des = await p.getByText('Desglose', { exact: true }).locator('../..').innerText();
  comprobar('taxímetro y su efectivo', /Taxímetro\s+142,30\s€\s+43,80\s€/.test(des));
  comprobar('cada app con su efectivo', /Uber\s+68,40\s€\s+18,00\s€/.test(des) && /Bolt\s+24,75\s€\s+24,75\s€/.test(des));
  comprobar('app de tipo "cobrado"', /FreeNow · precio cerrado\s+46,10\s€\s+34,10\s€/.test(des));
  comprobar('lo cobrado con tarjeta', /Tarjeta\s+98,50\s€/.test(des));
  // La columna de efectivo tiene que dar lo mismo que la liquidación: 120,65.
  comprobar('el total cuadra con la liquidación', /Total\s+332,75\s€\s+120,65\s€/.test(des));
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:8080' });
  await p.getByRole('button', { name: 'Copiar para la empresa' }).first().click();
  await p.waitForTimeout(300);
  const copiado = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  comprobar('se copia listo para WhatsApp', copiado.includes('Uber: 68,40 € · efectivo 18,00 €') && copiado.includes('TOTAL: 332,75 € · efectivo 120,65 €'), copiado.split('\n').pop());

  console.log('\n— RESUMEN · SEMANA Y FECHAS —');
  // Mensual y Periodo son ahora una sola pestaña, Resumen, con Mes, Semana y Fechas.
  await p.getByRole('button', { name: /Resumen/ }).click();
  await p.waitForTimeout(400);
  comprobar('cinco pestañas abajo', (await p.locator('nav button').count()) === 5);
  comprobar('el resumen abre en el mes', (await p.getByRole('button', { name: 'Mes', exact: true }).getAttribute('aria-pressed')) === 'true');
  await p.getByRole('button', { name: 'Semana', exact: true }).click();
  await p.waitForTimeout(600);
  comprobar('la semana va de lunes a domingo', /Del \d{2}\/\d{2} al \d{2}\/\d{2}/.test(await p.locator('body').innerText()) && (await p.locator('#rangoDesde').count()) === 0);
  const per = await p.locator('body').innerText();
  comprobar('total del periodo', per.includes('332,75'));
  comprobar('un día trabajado', /1 día trabajado/.test(per));
  await p.getByRole('button', { name: 'Fechas', exact: true }).click();
  await p.waitForTimeout(300);
  const hoyQA = await p.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  await p.locator('#rangoDesde').fill(hoyQA);
  await p.locator('#rangoHasta').fill(hoyQA);
  await p.waitForTimeout(400);
  comprobar('fechas a elegir: solo hoy', (await p.locator('body').innerText()).includes('332,75') && /1 día trabajado/.test(await p.locator('body').innerText()));
  comprobar('el periodo también trae el desglose', /Total\s+332,75\s€\s+120,65\s€/.test(await p.getByText('Desglose', { exact: true }).locator('../..').innerText()));

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
  await p.getByRole('button', { name: /Resumen/ }).click(); await p.getByRole('button', { name: 'Mes', exact: true }).click();
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
  await p.getByRole('button', { name: /Resumen/ }).click(); await p.getByRole('button', { name: 'Mes', exact: true }).click();
  await p.waitForTimeout(600);
  const tras = await p.locator('body').innerText();
  comprobar('datos restaurados', tras.includes('332,75'));
  comprobar('la jornada viaja en la copia', /Propinas \(enteras para ti\)\s+12,50/.test(tras) && /Horas trabajadas/.test(tras));

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
  await p.getByRole('button', { name: /Resumen/ }).click(); await p.getByRole('button', { name: 'Mes', exact: true }).click();
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
  await abrirTodo(p);
  const propia = await p.getByText('Cálculo del día').locator('..').innerText();
  comprobar('la propia suma a la facturación', (await p.locator('body').innerText()).includes('230,00'), '100 + 50 + 80');
  comprobar('y la empresa cobra su parte', propia.includes('80,00'), '(50−20) + (80−30)');
  await p.getByRole('button', { name: 'Guardar día' }).click();
  await p.waitForTimeout(600);

  await p.getByLabel('Ajustes').click();
  await p.waitForTimeout(600);
  comprobar('no se puede quitar una con cifras dentro', await p.getByRole('button', { name: 'Quitar RTI' }).count() === 0);
  const comentarios = await p.getByRole('link', { name: 'Enviar comentarios' }).getAttribute('href').catch(() => null);
  const grupoWa = p.getByLabel('Grupo de conductores').getByRole('link', { name: 'Entrar al grupo de WhatsApp' });
  comprobar('enlace al grupo de WhatsApp de conductores', (await grupoWa.getAttribute('href').catch(() => null)) === 'https://chat.whatsapp.com/BF8BL89IBtE8BcqoRXg413' && (await grupoWa.getAttribute('target')) === '_blank');
  comprobar('botón para mandar ideas o fallos', !!comentarios && comentarios.startsWith('mailto:proyecto.txpro@gmail.com?subject=') && decodeURIComponent(comentarios).includes('Ideas o fallos'), comentarios || 'no está');

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
  comprobar('ya no hay tarjeta de días fuertes abajo', !/d[ÍI]as fuertes/i.test(dic));
  comprobar('lo de toda Madrid va en el mapa', /En toda Madrid:[^\n]*Nochevieja/.test(dic));
  comprobar('sale Nochevieja', dic.includes('Nochevieja'));
  comprobar('sale el puente de diciembre', /Puente de la Constituci/.test(dic));
  await p.getByRole('button', { name: /^2026-12-31/ }).click();
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
  const txtRoto = await pr.locator('body').innerText();
  comprobar('y no se inventa ningún día', !txtRoto.includes('sin fecha') && !txtRoto.includes('En toda Madrid'));
  comprobar('sin reventar por dentro', errRoto.length === 0, errRoto.join(' | '));
  await roto.close();

  // El orden dentro del día no puede depender de cómo esté escrito el archivo:
  // se sirve al revés y aun así tiene que salir 23:45 antes que 00:00.
  const reves = await b.newContext({ viewport: { width: 360, height: 700 }, locale: 'es-ES', serviceWorkers: 'block' });
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
    await irAMes(pv, '2026-10');
    await pv.getByRole('button', { name: /^2026-10-01/ }).click();
    await pv.waitForTimeout(400);
    return pv.locator('body').innerText();
  };
  const orden = (t) => ['Todo el día', 'Tarde', 'Noche', 'Madrugada'].map((x) => t.indexOf(x));
  const enOrden = (t) => { const o = orden(t); return o.every((v) => v > -1) && o.every((v, i) => i === 0 || o[i - 1] < v); };
  const primera = await abrirJueves();
  comprobar('ordena por hora aunque el archivo venga al revés', enOrden(primera), orden(primera).join(' '));
  comprobar('"hora" sola dice cuándo empieza', primera.includes('Empieza a las 18:00'));
  // Segunda apertura sin poder descargar: sale de lo guardado en el móvil, que es
  // donde se perdían las horas (se guardaba ya limpio y se limpiaba dos veces).
  await reves.unroute('**/eventos.json');
  await reves.route('**/eventos.json', (r) => r.abort());
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
  await irAMes(ps, '2026-12');
  comprobar('los días fuertes siguen ahí sin cobertura', (await ps.locator('body').innerText()).includes('Nochevieja'));
  comprobar('y el mapa también', (await ps.getByText('Dónde es').count()) > 0);
  await sinRed.close();

  console.log('\n— VIAJE A VIAJE —');
  // Cada casilla es una calculadora: el que quiera va sumando viaje a viaje, y al
  // salir de la casilla queda solo el total.
  const vv = await b.newContext({ viewport: { width: 360, height: 800 }, locale: 'es-ES', timezoneId: 'Europe/Madrid' });
  const pc = await vv.newPage();
  const errVV = [];
  pc.on('pageerror', (e) => errVV.push(e.message));
  await pc.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
  await pc.waitForSelector('text=INGRESOS DEL DÍA');
  const taxi = pc.locator('input[aria-label="Taxímetro"]');
  await taxi.fill('10,65+8.40');           // con coma y con punto, las dos valen
  await pc.waitForTimeout(300);
  comprobar('la cuenta sale en vivo', (await pc.locator('body').innerText()).includes('= 19,05'));
  comprobar('y la facturación ya la cuenta', (await hoyTxt(pc)).includes('19,05'));
  await taxi.press('Enter');
  await pc.waitForTimeout(200);
  comprobar('al salir queda solo el total', (await taxi.inputValue()) === '19.05', await taxi.inputValue());

  // Sin tecla "+": el botón la pone, y la casilla no pierde el foco (el teclado
  // del móvil no se cierra entre viaje y viaje).
  await taxi.click();
  await pc.getByRole('button', { name: '+ Sumar otro viaje' }).click();
  comprobar('el botón pone el "+"', (await taxi.inputValue()) === '19.05+', await taxi.inputValue());
  comprobar('sin cerrar el teclado', (await pc.evaluate(() => document.activeElement && document.activeElement.getAttribute('aria-label'))) === 'Taxímetro');
  await pc.keyboard.type('5');
  await taxi.press('Enter');
  await pc.waitForTimeout(200);
  comprobar('viaje sumado', (await taxi.inputValue()) === '24.05', await taxi.inputValue());
  const tarjeta = pc.locator('input[aria-label="Tarjeta"]');
  await tarjeta.fill('abc7');
  comprobar('lo que no es número no entra', (await tarjeta.inputValue()) === '7', await tarjeta.inputValue());
  await tarjeta.fill('');

  // Lo apuntado sin guardar sobrevive a cerrar la app...
  await pc.reload({ waitUntil: 'load' });
  await pc.waitForSelector('text=INGRESOS DEL DÍA');
  comprobar('sigue ahí tras cerrar la app', (await taxi.inputValue()) === '24.05', await taxi.inputValue());
  comprobar('y avisa de que falta guardar', (await pc.locator('body').innerText()).includes('sin guardar'));
  // ...y a mirar otro día y volver.
  const fecha = pc.locator('input[type="date"]');
  const hoy = await fecha.inputValue();
  const ayer = await pc.evaluate(() => { const d = new Date(); d.setDate(d.getDate() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  await fecha.fill(ayer);
  await pc.waitForTimeout(300);
  comprobar('el otro día sale limpio', (await taxi.inputValue()) === '');
  await fecha.fill(hoy);
  await pc.waitForTimeout(300);
  comprobar('y al volver sigue lo apuntado', (await taxi.inputValue()) === '24.05');

  // Propinas con calculadora y carreras de una en una.
  await abrirTodo(pc);
  const propinas = pc.locator('input[aria-label="Propinas"]');
  await propinas.fill('2+1,5');
  await propinas.press('Enter');
  await pc.waitForTimeout(200);
  comprobar('propinas sumadas', (await propinas.inputValue()) === '3.5', await propinas.inputValue());
  const carreras = pc.locator('input[aria-label="Número de carreras"]');
  await carreras.click();
  await pc.getByRole('button', { name: '+1 carrera' }).click();
  await pc.getByRole('button', { name: '+1 carrera' }).click();
  comprobar('+1 carrera dos veces', (await carreras.inputValue()) === '2', await carreras.inputValue());

  // Guardar deja el día limpio y sin aviso.
  await pc.getByRole('button', { name: 'Guardar día' }).click();
  await pc.waitForTimeout(500);
  comprobar('al guardar se va el aviso', !(await pc.locator('body').innerText()).includes('sin guardar'));
  await pc.reload({ waitUntil: 'load' });
  await pc.waitForSelector('text=INGRESOS DEL DÍA');
  comprobar('el día guardado queda en 24,05', (await taxi.inputValue()) === '24.05');
  const diasVV = await pc.evaluate(() => JSON.parse(localStorage.getItem('tc_days') || '{}'));
  const elDia = Object.values(diasVV)[0] || {};
  comprobar('se guarda el número, no la cuenta', elDia.taximetro === 24.05 && elDia.propinas === 3.5 && elDia.carreras === 2, JSON.stringify(elDia).slice(0, 90));
  comprobar('viaje a viaje sin errores', errVV.length === 0, errVV.join(' | '));
  await vv.close();

  console.log('\n— COMBUSTIBLE: LO VIEJO DE GASTOS Y LO NUEVO DEL DIARIO —');
  // Quien ya tenía repostajes apuntados en Gastos no puede perderlos al pasar el
  // combustible al Diario: tienen que sumarse los dos, también para el bono.
  const cb = await b.newContext({ viewport: { width: 360, height: 900 }, locale: 'es-ES', timezoneId: 'Europe/Madrid' });
  await cb.addInitScript(() => {
    if (localStorage.getItem('tc_days')) return;
    const d = new Date(); const hoy = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    localStorage.setItem('tc_days', JSON.stringify({ [hoy]: { taximetro: 1000, visa: 0, combustible: 60 } }));
    localStorage.setItem('tc_gastos', JSON.stringify([{ id: 1, date: hoy, concepto: 'Combustible', importe: 40, reembolsable: false }]));
    localStorage.setItem('tc_cfg', JSON.stringify({ incentivo: 'combustible', umbral: '500', pctCombustible: '50' }));
    localStorage.setItem('tc_cfg_ok', 'true');
  });
  const pc2 = await cb.newPage();
  await pc2.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
  await pc2.waitForSelector('text=INGRESOS DEL DÍA');
  await pc2.getByRole('button', { name: /Gastos/ }).click();
  await pc2.waitForTimeout(400);
  const gc = await pc2.locator('body').innerText();
  comprobar('lo viejo de Gastos sigue ahí', gc.includes('40,00') && gc.includes('Apuntado día a día en el Diario') && gc.includes('60,00'));
  comprobar('y el mes suma los dos', gc.includes('100,00'));
  await pc2.getByRole('button', { name: /Resumen/ }).click();
  await pc2.waitForTimeout(500);
  // facturación 1000 ≥ 500 → 50 % de (40 + 60) = 50,00
  comprobar('el bono cuenta los dos', /50% del combustible/.test(await pc2.locator('body').innerText()) && (await pc2.locator('body').innerText()).includes('50,00'));
  await cb.close();

  console.log('\n— MAPA DE LOS EVENTOS —');
  const mp = await b.newContext({ viewport: { width: 320, height: 900 }, locale: 'es-ES', timezoneId: 'Europe/Madrid' });
  const pm = await mp.newPage();
  const errMp = [];
  pm.on('pageerror', (e) => errMp.push(e.message));
  await pm.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
  await pm.waitForSelector('text=INGRESOS DEL DÍA');
  await pm.waitForTimeout(700);
  await pm.getByRole('button', { name: /Calendario/ }).click();
  await pm.waitForTimeout(500);
  await irAMes(pm, '2026-10');
  await pm.getByRole('button', { name: /^2026-10-02/ }).click();
  await pm.waitForTimeout(500);
  const tarjetaMapa = () => pm.getByText('Dónde es').locator('../..').innerText();
  comprobar('el mapa sale en el calendario', (await pm.getByText('Dónde es').count()) > 0);
  comprobar('solo la vista de toda la Comunidad', (await pm.getByRole('button', { name: 'Madrid', exact: true }).count()) === 0);
  // Viernes 2: lo de la capital (Las Ventas, Vistalegre, Movistar, Iberdrola) cae
  // junto y se agrupa; el Warner va aparte con su número.
  comprobar('el Warner con su punto', (await pm.locator('button[aria-label^="5. Parque Warner"]').count()) === 1);
  const grupo = pm.locator('button[aria-label*="sitios juntos"]');
  comprobar('lo de la capital, agrupado', (await grupo.count()) === 1 && (await grupo.innerText()) === '4');
  await grupo.click();
  await pm.waitForTimeout(200);
  let lm = await tarjetaMapa();
  comprobar('tocar el grupo deja esos sitios en la lista', lm.includes('Las Ventas') && lm.includes('Movistar Arena') && !lm.includes('Halloween Scary Nights'));
  await pm.getByRole('button', { name: 'Ver todos los sitios' }).click();
  await pm.locator('button[aria-label^="5. Parque Warner"]').click();
  await pm.waitForTimeout(200);
  lm = await tarjetaMapa();
  comprobar('tocar un punto enseña solo ese sitio', lm.includes('Halloween Scary Nights') && !lm.includes('Guitarricadelafuente'));
  comprobar('sin tarjeta de días fuertes', (await pm.getByText(/Días fuertes/i).count()) === 0);
  await pm.getByRole('button', { name: 'Todo el mes' }).click();
  await pm.waitForTimeout(300);
  lm = await tarjetaMapa();
  comprobar('todo el mes: los días de cada sitio', lm.includes('Las Ventas') && lm.includes('Lun 12'));
  await pm.getByRole('button', { name: 'Lun 12', exact: true }).first().click();
  await pm.waitForTimeout(400);
  comprobar('y un día lleva a ese día', (await tarjetaMapa()).includes('Corrida de la Hispanidad'));
  comprobar('el mapa no se sale en 320 px', (await pm.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) === 0);
  comprobar('mapa sin errores', errMp.length === 0, errMp.join(' | '));
  await mp.close();

  // Lo que les pasó a los probadores al actualizar a la 1.9.0: tenían guardado
  // el calendario de antes, sin "lugares", y la app no lo volvía a pedir hasta
  // pasadas 12 horas, así que el mapa salía vacío. Tiene que refrescarse al abrir.
  const vj = await b.newContext({ viewport: { width: 360, height: 900 }, locale: 'es-ES', timezoneId: 'Europe/Madrid' });
  const calViejo = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', 'eventos.json'), 'utf8'));
  delete calViejo.lugares;
  await vj.addInitScript((v) => { if (!localStorage.getItem('tc_eventos')) { localStorage.setItem('tc_eventos', JSON.stringify(v)); localStorage.setItem('tc_eventos_visto', JSON.stringify(Date.now() - 3600000)); } }, calViejo);
  const pv2 = await vj.newPage();
  await pv2.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
  await pv2.waitForSelector('text=INGRESOS DEL DÍA');
  await pv2.waitForTimeout(800);
  await pv2.getByRole('button', { name: /Calendario/ }).click();
  await pv2.waitForTimeout(500);
  await irAMes(pv2, '2026-10');
  await pv2.getByRole('button', { name: 'Todo el mes' }).click();
  await pv2.waitForTimeout(400);
  comprobar('con el calendario viejo guardado, el mapa se llena al abrir', !(await pv2.locator('body').innerText()).includes('no hay nada con sitio concreto'));
  await vj.close();

  console.log('\n— OBJETIVOS —');
  const ob = await b.newContext({ viewport: { width: 360, height: 900 }, locale: 'es-ES', timezoneId: 'Europe/Madrid' });
  const po = await ob.newPage();
  const errOb = [];
  po.on('pageerror', (e) => errOb.push(e.message));
  await po.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
  await po.waitForSelector('text=INGRESOS DEL DÍA');
  await po.getByRole('button', { name: /Objetivos/ }).click();
  await po.waitForTimeout(500);
  comprobar('sin objetivos invita a ponerlos', (await po.locator('body').innerText()).includes('Ponte un objetivo'));
  await po.getByRole('button', { name: /Diario/ }).click();
  await po.locator('input[aria-label="Taxímetro"]').fill('150');
  await po.getByRole('button', { name: 'Guardar día' }).click();
  await po.waitForTimeout(400);
  await po.getByRole('button', { name: /Objetivos/ }).click();
  await po.locator('#obj-dia').fill('100');
  await po.locator('#obj-semana').fill('300');
  await po.locator('#obj-mes').fill('1000');
  await po.waitForTimeout(1200);
  let ot = await po.locator('body').innerText();
  // Días de esta semana (lunes a domingo) que caen en el mes: el objetivo semanal
  // de 300 se reparte entre ellos, y lo de otro mes no cuenta.
  const enMes = await po.evaluate(() => { const h = new Date(); const lun = new Date(h.getFullYear(), h.getMonth(), h.getDate() - ((h.getDay() + 6) % 7)); let n = 0; for (let i = 0; i < 7; i++) { const d = new Date(lun.getFullYear(), lun.getMonth(), lun.getDate() + i); if (d.getMonth() === h.getMonth()) n++; } return n; });
  // Se reparte por días de trabajo (6 a la semana si no se dice otra cosa): con
  // menos días que esos dentro del mes, el objetivo es la parte que les toca.
  const metaCon = (dias) => (enMes < dias ? Math.round((300 * enMes / dias) * 100) / 100 : 300);
  let metaSem = metaCon(6);
  const pctSem = (v) => Math.round((v / metaSem) * 100);
  const eur = (v) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(v).replace(/ /g, ' ');
  ot = ot.replace(/ /g, ' ');
  comprobar('el centro dice el % del mes', /15%\s+del mes/.test(ot));
  comprobar('hoy superado', /Hoy\s+150%/.test(ot) && ot.includes('Superado por 50,00'));
  comprobar('la semana, cortada en el mes', new RegExp(`Esta semana[^\\n]*\\s+${pctSem(150)}%`).test(ot), `${enMes} días del mes · ${pctSem(150)}%`);
  if (enMes < 6) comprobar('y lo explica', ot.includes(`${enMes}/6 de tus 300`));
  // El mes pide lo que falta entre los días de TRABAJO que quedan, no los del calendario.
  const quedanTrab = await po.evaluate(() => { const h = new Date(); const fin = new Date(h.getFullYear(), h.getMonth() + 1, 0).getDate(); return Math.max(1, Math.round(((fin - h.getDate() + 1) * 6) / 7)); });
  const ultimoDia = await po.evaluate(() => { const h = new Date(); return new Date(h.getFullYear(), h.getMonth() + 1, 0).getDate() === h.getDate(); });
  if (!ultimoDia) comprobar('el mes cuenta días de trabajo', ot.includes(`en los ${quedanTrab} días de trabajo que quedan`), `${quedanTrab} días`);
  // Se llena viaje a viaje: lo apuntado sin guardar también cuenta.
  await po.getByRole('button', { name: /Diario/ }).click();
  await po.locator('input[aria-label="Taxímetro"]').fill('150+50');
  await po.getByRole('button', { name: /Objetivos/ }).click();
  await po.waitForTimeout(1200);
  ot = (await po.locator('body').innerText()).replace(/ /g, ' ');
  comprobar('se llena en directo sin guardar', /20%\s+del mes/.test(ot) && new RegExp(`Esta semana[^\\n]*\\s+${pctSem(200)}%`).test(ot));
  // Quien trabaja 5 días: el reparto de la semana cambia con él.
  await po.getByRole('button', { name: 'Un día menos' }).click();
  await po.waitForTimeout(400);
  metaSem = metaCon(5);
  ot = (await po.locator('body').innerText()).replace(/\u00a0/g, ' ');
  comprobar('con 5 días de trabajo, otro reparto', (await po.getByLabel('Días de trabajo a la semana').innerText()) === '5' && new RegExp(`Esta semana[^\\n]*\\s+${pctSem(200)}%`).test(ot), `${pctSem(200)}%`);
  comprobar('los anillos se pintan', (await po.locator('svg circle').count()) >= 6);
  await po.reload({ waitUntil: 'load' });
  await po.waitForSelector('text=INGRESOS DEL DÍA');
  await po.getByRole('button', { name: /Objetivos/ }).click();
  comprobar('los objetivos se quedan guardados', (await po.locator('#obj-mes').inputValue()) === '1000');
  comprobar('objetivos sin errores', errOb.length === 0, errOb.join(' | '));
  await ob.close();

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
  // En iPhone sale otro: cómo instalarla desde Safari.
  const veIOS = (pg) => pg.getByText('Instala TXpro en tu iPhone').count().then((n) => n > 0);
  comprobar('en iPhone explica cómo instalarla desde Safari', await veIOS(iphone.pg) && (await iphone.pg.locator('body').innerText()).includes('Añadir a pantalla de inicio'));
  await iphone.pg.getByRole('button', { name: 'Más tarde' }).click();
  await iphone.pg.waitForTimeout(300);
  comprobar('"Más tarde" lo cierra también en iPhone', !(await veIOS(iphone.pg)));
  await iphone.pg.reload({ waitUntil: 'load' });
  await iphone.pg.waitForSelector('text=INGRESOS DEL DÍA');
  comprobar('y no vuelve al recargar en iPhone', !(await veIOS(iphone.pg)));
  await iphone.c.close();
  const iphoneApp = await abrirComo(IPHONE_UA, 'Object.defineProperty(navigator, "standalone", { value: true });');
  comprobar('no sale en el iPhone que ya la tiene instalada', !(await veIOS(iphoneApp.pg)));
  await iphoneApp.c.close();
  const webAndroid = await abrirComo(ANDROID_UA);
  comprobar('el aviso de iPhone no sale en Android', !(await veIOS(webAndroid.pg)));
  await webAndroid.c.close();

  console.log('\n— HOY Y CRONÓMETRO —');
  const ch = await b.newContext({ viewport: { width: 390, height: 800 }, locale: 'es-ES' });
  await ch.addInitScript(() => {
    if (sessionStorage.getItem('sembrado')) return; sessionStorage.setItem('sembrado', '1');
    localStorage.setItem('tc_cfg_ok', 'true'); localStorage.setItem('tc_aviso_play', JSON.stringify(Date.now()));
    const d = new Date(); const f = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    const hoy = f(d); const mesPasado = f(new Date(d.getFullYear(), d.getMonth() - 1, 10));
    localStorage.setItem('tc_days', JSON.stringify({ [hoy]: { taximetro: 150, uber: 50, uberEfec: 10, carreras: 12 }, [mesPasado]: { taximetro: 100 } }));
  });
  const ph = await ch.newPage();
  const errHoy = []; ph.on('pageerror', (e) => errHoy.push(e.message));
  await ph.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
  await ph.waitForSelector('text=INGRESOS DEL DÍA');
  const tarjetaHoy = () => ph.getByLabel('Resumen del día').innerText();
  let th = await tarjetaHoy();
  comprobar('la tarjeta de hoy enseña lo facturado y las carreras', th.includes('200,00') && /12 carreras/.test(th), th.slice(0, 120));
  comprobar('y la semana, con su total', /semana/i.test(th) && th.includes('200,00'));
  await ph.getByRole('button', { name: /Empezar jornada/ }).click();
  await ph.waitForTimeout(300);
  await abrir(ph, /^Tu jornada/);
  const reloj = await ph.evaluate(() => JSON.parse(localStorage.getItem('tc_reloj') || 'null'));
  const ahoraHM = await ph.evaluate((ini) => { const d = new Date(ini || Date.now()); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }, reloj && reloj.inicio);
  comprobar('«Empezar jornada» pone en marcha el cronómetro', !!reloj && (await ph.getByLabel('Hora de empezar').inputValue()) === ahoraHM, JSON.stringify(reloj));
  // Dos horas antes, con un cuarto de hora de pausa: así se ve la cuenta.
  await ph.evaluate(() => { const r = JSON.parse(localStorage.getItem('tc_reloj')); r.inicio -= 2 * 3600000; r.pausado = 15 * 60000; localStorage.setItem('tc_reloj', JSON.stringify(r)); });
  await ph.reload({ waitUntil: 'load' });
  await ph.waitForSelector('text=INGRESOS DEL DÍA');
  th = await tarjetaHoy();
  comprobar('el cronómetro sigue tras cerrar la app y descuenta la pausa', /En jornada desde/.test(th) && /1 h 45 min/.test(th), th.slice(0, 200));
  await ph.getByRole('button', { name: /Pausa/ }).click();
  await ph.waitForTimeout(200);
  comprobar('se puede pausar', /En pausa/.test(await tarjetaHoy()));
  await ph.getByRole('button', { name: /Seguir/ }).click();
  await ph.waitForTimeout(200);
  await ph.getByRole('button', { name: /Terminar jornada/ }).click();
  await ph.waitForTimeout(300);
  // Al terminar, la jornada se abre sola: toca apuntar carreras y propinas.
  comprobar('al terminar se despliega «Tu jornada»', (await ph.getByLabel('Hora de terminar').count()) === 1);
  const fin = await ph.getByLabel('Hora de terminar').inputValue();
  const cuerpoHoy = await ph.locator('body').innerText();
  comprobar('«Terminar» apunta la hora de acabar y el descanso', fin === ahoraHM || fin > ahoraHM ? /Descontados 15 min/.test(cuerpoHoy) : false, fin);
  comprobar('y deja de correr', (await ph.evaluate(() => localStorage.getItem('tc_reloj'))) === null);
  await ph.getByRole('button', { name: 'Guardar día' }).click();
  await ph.waitForTimeout(300);
  const guardadoHoy = await ph.evaluate(() => { const d = new Date(); const f = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; return JSON.parse(localStorage.getItem('tc_days'))[f]; });
  comprobar('el día se guarda con su descanso', guardadoHoy && guardadoHoy.descanso === 15 && !!guardadoHoy.inicio && !!guardadoHoy.fin, JSON.stringify(guardadoHoy));
  await ph.getByRole('button', { name: /Resumen/ }).last().click();
  await ph.waitForTimeout(500);
  const resumenHoy = await ph.locator('body').innerText();
  comprobar('Resumen reparte por plataforma', /POR PLATAFORMA/i.test(resumenHoy) && /Taxímetro[\s\S]*75 %/.test(resumenHoy), resumenHoy.slice(0, 80));
  comprobar('y compara con el mes anterior', /▲ 100 % frente a/.test(resumenHoy));
  comprobar('hoy y cronómetro sin errores', errHoy.length === 0, errHoy.join(' | '));
  await ch.close();

  console.log('\n— CUOTA FIJA (ALQUILER) Y SALDO CON LA EMPRESA —');
  // Hay conductores que no van a porcentaje: pagan a la empresa una cuota fija,
  // por día trabajado o al mes, y el resto es suyo. Día de prueba: 271,40 €
  // facturados, de los que la empresa cobró 138,20 (apps y tarjeta).
  const conAcuerdo = async (cfg, dia) => {
    const c = await b.newContext({ viewport: { width: 390, height: 800 }, locale: 'es-ES', serviceWorkers: 'block' });
    await c.addInitScript(([cfg, dia]) => {
      if (sessionStorage.getItem('sembrado')) return; sessionStorage.setItem('sembrado', '1');
      localStorage.setItem('tc_cfg_ok', 'true'); localStorage.setItem('tc_aviso_play', JSON.stringify(Date.now()));
      localStorage.setItem('tc_cfg', JSON.stringify(cfg));
      const d = new Date(); const hoy = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      localStorage.setItem('tc_days', JSON.stringify({ [hoy]: dia }));
    }, [cfg, dia]);
    const pg = await c.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
    await pg.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
    await pg.waitForSelector('text=INGRESOS DEL DÍA');
    return { c, pg, errs };
  };
  const diaCuota = { taximetro: 182.5, visa: 64.3, uber: 48.5, uberEfec: 15, cabify: 22, bolt: 18.4 };
  const resumenDe = async (pg) => { await pg.getByRole('button', { name: /Resumen/ }).last().click(); await pg.waitForTimeout(500); return pg.locator('body').innerText(); };

  // 125 € por día trabajado: tu parte = 271,40 − 125 = 146,40; la empresa cobró
  // 138,20 y se queda 125 → te debe 13,20.
  const porDia = await conAcuerdo({ modo: 'fijo', cuota: '125', cuotaPor: 'dia' }, diaCuota);
  let tc = await hoyTxt(porDia.pg);
  comprobar('cuota por día: tu parte es lo facturado menos la cuota', /tu parte 146,40/.test(tc), tc.slice(0, 120));
  comprobar('cuota por día: la empresa te debe lo que cobró de más', /La empresa te debe 13,20/.test(tc));
  await abrir(porDia.pg, /Cálculo con la empresa/);
  const calcCuota = await porDia.pg.getByText('Cálculo del día').locator('..').innerText();
  comprobar('el cálculo del día enseña la cuota', /Cuota para la empresa\s+125,00/.test(calcCuota) && /Para ti, quitada la cuota\s+146,40/.test(calcCuota));
  let rc = await resumenDe(porDia.pg);
  comprobar('el mes cuenta la cuota por los días trabajados', /Cuota a la empresa \(125\s€ × 1 día\)\s+125,00/.test(rc));
  comprobar('y el balance del mes', /EMPRESA DEBE AL CONDUCTOR[\s\S]*13,20/i.test(rc));
  comprobar('arriba del Resumen: tu parte, tus gastos y lo que te queda', /TRAS LA CUOTA\s+146,40\s€\s+TUS GASTOS\s+0,00\s€\s+TE QUEDA\s+146,40/i.test(rc), rc.slice(rc.indexOf('Facturado'), rc.indexOf('Facturado') + 120));
  // Con cuota fija no hay bono ni % de combustible: la gasolina es del conductor.
  await porDia.pg.getByLabel('Ajustes').click(); await porDia.pg.waitForTimeout(400);
  const ajCuota = await porDia.pg.locator('body').innerText();
  comprobar('Ajustes explica el acuerdo de cuota', /Pagas a la empresa 125\s€ por cada día que trabajes/.test(ajCuota) && !/Incentivo por facturación/i.test(ajCuota));
  // De vuelta a porcentaje, al 60 %: de 271,40 le tocan 108,56 a la empresa, que
  // ya cobró 138,20 → te debe 29,64. (Con la cuenta antigua salía otra cosa en
  // cuanto el porcentaje no era el 50 %.)
  await porDia.pg.getByRole('button', { name: 'A porcentaje' }).click(); await porDia.pg.waitForTimeout(200);
  await porDia.pg.locator('#cfgPct').fill('60'); await porDia.pg.waitForTimeout(200);
  comprobar('a porcentaje vuelve el incentivo', /Incentivo por facturación/i.test(await porDia.pg.locator('body').innerText()));
  await porDia.pg.getByRole('button', { name: /Diario/ }).click(); await porDia.pg.waitForTimeout(400);
  tc = await hoyTxt(porDia.pg);
  comprobar('al 60 %: tu parte y el saldo cuadran', /tu parte 162,84/.test(tc) && /La empresa te debe 29,64/.test(tc), tc.slice(0, 120));
  comprobar('cuota por día sin errores', porDia.errs.length === 0, porDia.errs.join(' | '));
  await porDia.c.close();

  // Todo en efectivo al 60 %: de 100 € te quedas 60 y debes 40 (no 60).
  const efectivo60 = await conAcuerdo({ pctConductor: 60 }, { taximetro: 100 });
  tc = await hoyTxt(efectivo60.pg);
  comprobar('al 60 % y todo en efectivo debes el 40 %', /tu parte 60,00/.test(tc) && /Debes a la empresa 40,00/.test(tc), tc.slice(0, 120));
  await efectivo60.c.close();

  // 2.800 € al mes: el saldo es del mes. La empresa lleva cobrados 138,20 →
  // faltan 2.661,80 para cubrir la cuota (y de paso, los miles llevan punto).
  const porMes = await conAcuerdo({ modo: 'fijo', cuota: '2800', cuotaPor: 'mes' }, diaCuota);
  tc = await hoyTxt(porMes.pg);
  comprobar('cuota al mes: Hoy dice lo que falta para cubrirla', /cuota de 2\.800\s€ al mes/.test(tc) && /Faltan para cubrir la cuota del mes 2\.661,80/.test(tc), tc.slice(0, 140));
  rc = await resumenDe(porMes.pg);
  comprobar('y el Resumen del mes en curso también', /FALTAN PARA CUBRIR LA CUOTA DEL MES[\s\S]*2\.661,80/i.test(rc) && /Cuota mensual a la empresa\s+2\.800,00/.test(rc));
  comprobar('con cuota mensual la tabla enseña lo que cobró la empresa', /Cobró empresa/.test(rc) && !/Diferencia/.test(rc));
  comprobar('cuota al mes sin errores', porMes.errs.length === 0, porMes.errs.join(' | '));
  await porMes.c.close();

  console.log('\n— EL AÑO, LOS DÍAS QUE MÁS RINDEN Y EL INFORME EN PDF —');
  // Dos meses de este año (o el anterior, si estamos en enero): el mes pasado
  // con dos días y este con uno. 50 %, sin gastos.
  const ca = await b.newContext({ viewport: { width: 390, height: 800 }, locale: 'es-ES', serviceWorkers: 'block', acceptDownloads: true });
  await ca.addInitScript(() => {
    if (sessionStorage.getItem('sembrado')) return; sessionStorage.setItem('sembrado', '1');
    localStorage.setItem('tc_cfg_ok', 'true'); localStorage.setItem('tc_aviso_play', JSON.stringify(Date.now()));
    const d = new Date(); const f = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    const base = d.getMonth() === 0 ? new Date(d.getFullYear() - 1, 11, 20) : d;   // todo dentro del mismo año
    const a1 = f(new Date(base.getFullYear(), base.getMonth() - 1, 5)), a2 = f(new Date(base.getFullYear(), base.getMonth() - 1, 6)), a3 = f(new Date(base.getFullYear(), base.getMonth(), 1));
    localStorage.setItem('tc_days', JSON.stringify({ [a1]: { taximetro: 1000, visa: 400, propinas: 10 }, [a2]: { taximetro: 300 }, [a3]: { taximetro: 200, uber: 100 } }));
    localStorage.setItem('tc_gastos', JSON.stringify([{ id: 1, date: a1, concepto: 'Lavado', importe: 20, reembolsable: false }]));
  });
  const pa = await ca.newPage(); const errAnio = []; pa.on('pageerror', (e) => errAnio.push(e.message));
  await pa.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
  await pa.waitForSelector('text=INGRESOS DEL DÍA');
  await pa.getByRole('button', { name: /Resumen/ }).last().click(); await pa.waitForTimeout(400);
  await pa.getByRole('button', { name: 'Año', exact: true }).click(); await pa.waitForTimeout(400);
  const anioTxt = await pa.locator('body').innerText();
  // 1.600 facturados en 3 días; tu 50 % = 800; + 10 de propinas − 20 de lavado = 790.
  comprobar('el año suma lo facturado de sus meses', /1\.600,00\s€/.test(anioTxt) && /3 días/.test(anioTxt) && /2 meses con datos/.test(anioTxt), anioTxt.slice(0, 200).replace(/\n/g, ' '));
  comprobar('y lo que te queda, con propinas y gastos', /TU 50%\s+800,00\s€\s+TUS GASTOS\s+−20,00\s€\s+TE QUEDA\s+790,00/i.test(anioTxt));
  const mesAMes = await pa.getByLabel('Mes a mes').innerText();
  comprobar('mes a mes: días, facturado y lo que queda', /2\s+1\.300,00\s€\s+640,00\s€/.test(mesAMes) && /1\s+300,00\s€\s+150,00\s€/.test(mesAMes), mesAMes.replace(/\n/g, ' ').slice(0, 200));
  const rinden = await pa.getByLabel('Qué días rinden más').innerText();
  comprobar('dice qué día de la semana rinde más y el récord', /Tu mejor día es el/.test(rinden) && /Tu récord: 1\.000,00\s€/.test(rinden), rinden.replace(/\n/g, ' ').slice(-160));
  await pa.getByLabel('Mes a mes').getByRole('button').first().click(); await pa.waitForTimeout(400);
  comprobar('tocar un mes lleva a su liquidación', /Liquidación mensual/i.test(await pa.locator('body').innerText()) && /1\.300,00/.test(await pa.getByLabel('Resumen del periodo').innerText()));
  // El informe: sin hoja de compartir (como aquí) se descarga. Tiene que ser un
  // PDF de verdad, con sus páginas y su tabla de referencias.
  const bajar = async (boton) => { const [dl] = await Promise.all([pa.waitForEvent('download'), pa.getByRole('button', { name: boton, exact: true }).click()]); const fs = require('fs'); const buf = fs.readFileSync(await dl.path()); await pa.waitForTimeout(3200); return { nombre: dl.suggestedFilename(), buf }; };
  const pdfEmpresa = await bajar('Para la empresa');
  const cuerpoPdf = pdfEmpresa.buf.toString('latin1');
  comprobar('el informe para la empresa es un PDF', /^TXpro-\d{4}-\d{2}\.pdf$/.test(pdfEmpresa.nombre) && cuerpoPdf.startsWith('%PDF-1.4') && cuerpoPdf.trimEnd().endsWith('%%EOF'), pdfEmpresa.nombre);
  const xref = Number((cuerpoPdf.match(/startxref\n(\d+)\n/) || [])[1]);
  comprobar('con sus páginas y la tabla en su sitio', /\/Type \/Pages[^>]*\/Count [1-9]/.test(cuerpoPdf) && cuerpoPdf.slice(xref, xref + 4) === 'xref' && /\/Filter \/DCTDecode/.test(cuerpoPdf) && pdfEmpresa.buf.length > 30000, `${pdfEmpresa.buf.length} bytes`);
  const pdfCompleto = await bajar('Completo');
  comprobar('y el completo también', /^TXpro-\d{4}-\d{2}-completo\.pdf$/.test(pdfCompleto.nombre) && pdfCompleto.buf.toString('latin1').startsWith('%PDF-1.4'), pdfCompleto.nombre);
  comprobar('año e informe sin errores', errAnio.length === 0, errAnio.join(' | '));
  await ca.close();

  console.log('\n— LAS DOS CARAS: CONDUCTOR Y EMPRESA O FLOTA —');
  const cf = await contextoNuevo({ viewport: { width: 390, height: 800 }, locale: 'es-ES', serviceWorkers: 'block' });
  const pf = await cf.newPage(); const errFlota = []; pf.on('pageerror', (e) => errFlota.push(e.message));
  pf.on('dialog', (d) => d.accept());
  await pf.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
  await pf.waitForSelector('text=¿Cómo vas a usar TXpro?');
  comprobar('la primera vez pregunta cómo se va a usar', (await pf.getByRole('button', { name: /Soy conductor/ }).count()) === 1 && (await pf.getByRole('button', { name: /Soy empresa o flota/ }).count()) === 1);
  await pf.getByRole('button', { name: /Soy empresa o flota/ }).click(); await pf.waitForTimeout(300);
  comprobar('la empresa empieza sin conductores', (await pf.getByLabel('Flota vacía').count()) === 1);
  // La flota de ejemplo se pone y se quita sin dejar rastro.
  await pf.getByRole('button', { name: /flota de ejemplo/ }).click(); await pf.waitForTimeout(300);
  comprobar('se puede ver con una flota de ejemplo', (await pf.getByLabel('Conductores').getByRole('button').count()) === 3 && /Facturado por la flota · 3 de 3 conductores/.test(await pf.getByLabel('Resumen de la flota').innerText()));
  await pf.getByRole('button', { name: 'Quitar' }).click(); await pf.waitForTimeout(300);
  comprobar('y quitarla', (await pf.getByLabel('Flota vacía').count()) === 1);
  // Alta de un conductor al 60 %.
  await pf.getByRole('button', { name: 'Dar de alta un conductor' }).click(); await pf.waitForTimeout(300);
  await pf.locator('#fNombre').fill('Pepe Ruiz'); await pf.locator('#fPct').fill('60');
  await pf.locator('.saveBtn', { hasText: 'Dar de alta' }).click(); await pf.waitForTimeout(300);
  const fichaTxt = await pf.getByLabel('Ficha del conductor').innerText();
  comprobar('dar de alta a un conductor con su acuerdo', /Pepe Ruiz/.test(fichaTxt) && /Al 60 %/.test(fichaTxt), fichaTxt.replace(/\n/g, ' '));
  comprobar('recién dado de alta no tiene cuentas', /Sin cuentas en/.test(await pf.locator('body').innerText()));
  // Sus cuentas llegan con su copia de seguridad: 100 € de taxímetro en
  // efectivo. Al 60 % le tocan 40 a la empresa, que no ha cobrado nada → el
  // conductor le debe 40. Lo mismo que ve él en su móvil.
  const fsF = require('fs'); const osF = require('os'); const pathF = require('path');
  const hoyF = await pf.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  const copiaF = pathF.join(fsF.mkdtempSync(pathF.join(osF.tmpdir(), 'txpro-')), 'copia.json');
  fsF.writeFileSync(copiaF, JSON.stringify({ app: 'txpro', formato: 3, days: { [hoyF]: { taximetro: 100, visa: 0 } }, gastos: [], cfg: {} }));
  await pf.locator('input[aria-label="Copia del conductor"]').setInputFiles(copiaF); await pf.waitForTimeout(400);
  comprobar('se cargan las cuentas del conductor desde su copia', /Cargados 1 días de Pepe Ruiz/.test(await pf.locator('body').innerText()));
  const cuentasF = await pf.getByLabel('Cuentas del conductor', { exact: true }).innerText();
  comprobar('las cuentas salen con su acuerdo', /100,00\s€/.test(cuentasF) && /EMPRESA\s+40,00\s€/i.test(cuentasF) && /SU EFECTIVO\s+100,00\s€/i.test(cuentasF), cuentasF.replace(/\n/g, ' '));
  comprobar('y el saldo, visto desde la empresa', /TE DEBE EL CONDUCTOR[\s\S]*40,00\s€/i.test(await pf.getByLabel('Saldo con el conductor').innerText()));
  await pf.getByRole('button', { name: '‹ Flota' }).click(); await pf.waitForTimeout(300);
  const panelF = await pf.locator('body').innerText();
  comprobar('el panel suma la flota y dice quién debe', /Te deben 40,00\s€ · 1 conductor/.test(panelF) && /Pepe Ruiz[\s\S]*Te debe 40,00\s€/.test(panelF));
  // Un archivo que no es una copia no rompe nada.
  await pf.getByLabel('Conductores').getByRole('button').first().click(); await pf.waitForTimeout(300);
  fsF.writeFileSync(copiaF, 'esto no es una copia');
  await pf.locator('input[aria-label="Copia del conductor"]').setInputFiles(copiaF); await pf.waitForTimeout(400);
  comprobar('un archivo cualquiera no rompe nada', /No se pudo leer el archivo/.test(await pf.locator('body').innerText()) && /100,00\s€/.test(await pf.getByLabel('Cuentas del conductor', { exact: true }).innerText()));
  // Todo queda guardado, y se puede pasar a conductor y volver.
  await pf.reload({ waitUntil: 'load' }); await pf.waitForSelector('text=Facturado por la flota');
  comprobar('la flota sigue al volver a abrir', /Pepe Ruiz/.test(await pf.locator('body').innerText()));
  await pf.getByLabel('Ajustes').click(); await pf.waitForTimeout(300);
  await pf.getByRole('button', { name: 'Cambiar a conductor' }).click();
  await pf.waitForSelector('text=INGRESOS DEL DÍA');
  comprobar('de empresa se puede pasar a conductor', true);
  await pf.getByLabel('Ajustes').click(); await pf.waitForTimeout(300);
  await pf.getByRole('button', { name: 'Cambiar a empresa o flota' }).click(); await pf.waitForTimeout(300);
  comprobar('y volver, con la flota intacta', /Pepe Ruiz/.test(await pf.locator('body').innerText()));
  await pf.getByLabel('Conductores').getByRole('button').first().click(); await pf.waitForTimeout(300);
  await pf.getByRole('button', { name: 'Dar de baja' }).click(); await pf.waitForTimeout(300);
  comprobar('dar de baja lo quita de la flota', (await pf.getByLabel('Flota vacía').count()) === 1);
  comprobar('empresa sin errores', errFlota.length === 0, errFlota.join(' | '));
  await cf.close();
  // Quien ya llevaba sus cuentas no ve la pregunta: sigue como conductor.
  const cv = await contextoNuevo({ viewport: { width: 390, height: 800 }, locale: 'es-ES', serviceWorkers: 'block' });
  await cv.addInitScript(() => { if (!localStorage.getItem('tc_days')) localStorage.setItem('tc_days', JSON.stringify({ '2026-01-10': { taximetro: 100 } })); });
  const pvj = await cv.newPage();
  await pvj.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
  const directo = await pvj.waitForSelector('text=INGRESOS DEL DÍA', { timeout: 8000 }).then(() => true).catch(() => false);
  comprobar('quien ya tenía cuentas entra directo como conductor', directo);
  await cv.close();

  console.log('\n— EMPRESA: APUNTAR DÍAS, INFORME, COCHES E INVITACIÓN —');
  const ce = await contextoNuevo({ viewport: { width: 390, height: 800 }, locale: 'es-ES', serviceWorkers: 'block', acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
  await ce.addInitScript(() => {
    if (sessionStorage.getItem('sembrado')) return; sessionStorage.setItem('sembrado', '1');
    localStorage.setItem('tc_rol', JSON.stringify('empresa'));
    localStorage.setItem('tc_flota', JSON.stringify({ empresa: 'Taxis Prueba', conductores: [{ id: 'c1', nombre: 'Ana Gil', acuerdo: { modo: 'fijo', cuota: '100', cuotaPor: 'dia' } }], vehiculos: [] }));
  });
  const pe = await ce.newPage(); const errEmp = []; pe.on('pageerror', (e) => errEmp.push(e.message));
  pe.on('dialog', (d) => d.accept());
  await pe.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
  await pe.waitForSelector('text=Facturado por la flota');
  await pe.getByLabel('Conductores').getByRole('button').first().click(); await pe.waitForTimeout(300);
  // La empresa apunta un día: 300 € de taxímetro, 250 con tarjeta. Cuota de 100
  // al día: la empresa cobró 250, se queda 100 y le debe 150 al conductor.
  await pe.getByRole('button', { name: 'Apuntar un día' }).click(); await pe.waitForTimeout(300);
  await pe.locator('input[aria-label="Taxímetro"]').fill('300'); await pe.locator('input[aria-label="Tarjeta"]').fill('250'); await pe.waitForTimeout(200);
  const cuentaDia = await pe.getByLabel('Cuenta del día').innerText();
  comprobar('la empresa ve la cuenta del día mientras apunta', /Facturado 300,00\s€/.test(cuentaDia) && /efectivo del conductor 50,00\s€/.test(cuentaDia) && /Le debes 150,00\s€/.test(cuentaDia), cuentaDia.replace(/\n/g, ' '));
  await pe.getByRole('button', { name: 'Guardar el día' }).click(); await pe.waitForTimeout(400);
  const trasDia = await pe.locator('body').innerText();
  comprobar('y el día queda en las cuentas del conductor', /Guardado el \d\d\/\d\d/.test(trasDia) && /EMPRESA\s+100,00\s€/i.test(await pe.getByLabel('Cuentas del conductor', { exact: true }).innerText()) && /LE DEBES AL CONDUCTOR[\s\S]*150,00\s€/i.test(await pe.getByLabel('Saldo con el conductor').innerText()));
  // El informe en PDF de ese conductor.
  const [dlEmp] = await Promise.all([pe.waitForEvent('download'), pe.getByRole('button', { name: 'Informe en PDF' }).click()]);
  const pdfEmp = require('fs').readFileSync(await dlEmp.path()).toString('latin1');
  comprobar('la empresa saca el informe en PDF del conductor', /^TXpro-\d{4}-\d{2}-Ana-Gil\.pdf$/.test(dlEmp.suggestedFilename()) && pdfEmp.startsWith('%PDF-1.4') && pdfEmp.trimEnd().endsWith('%%EOF'), dlEmp.suggestedFilename());
  // La invitación: un enlace con el acuerdo.
  await pe.getByRole('button', { name: 'Enviar invitación' }).click(); await pe.waitForTimeout(400);
  const enlaceInv = (await pe.getByLabel('Enlace de invitación').innerText()).trim();
  comprobar('la invitación es un enlace a la app', /^http:\/\/localhost:8080\/.*\?alta=[A-Za-z0-9_-]+$/.test(enlaceInv), enlaceInv.slice(0, 60));
  // Coches: alta, quién lo lleva y un gasto.
  await pe.getByRole('button', { name: /^Coches/ }).click(); await pe.waitForTimeout(300);
  comprobar('la empresa empieza sin coches', (await pe.getByLabel('Sin coches').count()) === 1);
  await pe.getByRole('button', { name: 'Añadir un coche' }).click(); await pe.waitForTimeout(300);
  await pe.locator('#vMatricula').fill('1234 abc'); await pe.locator('#vLicencia').fill('05123'); await pe.locator('#vConductor').selectOption('c1');
  await pe.getByRole('button', { name: 'Añadir el coche' }).click(); await pe.waitForTimeout(300);
  await pe.locator('input[aria-label="Importe del gasto"]').fill('120,50');
  await pe.getByRole('button', { name: 'Guardar gasto' }).click(); await pe.waitForTimeout(300);
  comprobar('se apuntan los gastos de un coche', /Seguro[\s\S]*120,50\s€/.test(await pe.getByLabel('Gastos del coche').innerText()));
  await pe.getByRole('button', { name: '‹ Coches' }).click(); await pe.waitForTimeout(300);
  const cochesTxt = await pe.getByLabel('Coches', { exact: true }).innerText();
  comprobar('el coche sale con su matrícula, licencia y conductor', /1234 ABC · licencia 05123/.test(cochesTxt) && /Ana Gil/.test(cochesTxt) && /−120,50\s€/.test(cochesTxt), cochesTxt.replace(/\n/g, ' '));
  await pe.getByRole('button', { name: /^Flota/ }).click(); await pe.waitForTimeout(300);
  const panelEmp = await pe.getByLabel('Resumen de la flota').innerText();
  comprobar('el panel resta los gastos de los coches', /Gastos de los coches −120,50\s€/.test(panelEmp) && /le quedan .?20,50\s€/.test(panelEmp), panelEmp.replace(/\n/g, ' ').slice(-120));
  await pe.getByLabel('Conductores').getByRole('button').first().click(); await pe.waitForTimeout(300);
  comprobar('y la ficha del conductor dice qué coche lleva', /1234 ABC · licencia 05123/.test(await pe.getByLabel('Ficha del conductor').innerText()));
  comprobar('empresa (días, coches, informe) sin errores', errEmp.length === 0, errEmp.join(' | '));
  await ce.close();

  // El conductor abre la invitación en su móvil: queda en la flota, con el
  // acuerdo de la empresa (100 € al día) y sin poder cambiarlo.
  const ci = await contextoNuevo({ viewport: { width: 390, height: 800 }, locale: 'es-ES', serviceWorkers: 'block' });
  const pi = await ci.newPage(); const errInv = []; pi.on('pageerror', (e) => errInv.push(e.message));
  pi.on('dialog', (d) => d.accept());
  await pi.goto(enlaceInv, { waitUntil: 'load' });
  await pi.waitForSelector('text=Invitación a una flota');
  const invTxt = await pi.getByLabel('Invitación a una flota').innerText();
  comprobar('el conductor ve quién le invita y con qué acuerdo', /Taxis Prueba te ha dado de alta como Ana Gil/.test(invTxt) && /Cuota de 100\s€ por día/.test(invTxt), invTxt.replace(/\n/g, ' ').slice(0, 140));
  await pi.getByRole('button', { name: 'Aceptar y unirme' }).click();
  await pi.waitForSelector('text=INGRESOS DEL DÍA');
  comprobar('al aceptar, el enlace desaparece de la dirección', !/alta=/.test(pi.url()), pi.url());
  await pi.locator('input[aria-label="Taxímetro"]').fill('300'); await pi.waitForTimeout(300);
  const hoyInv = await hoyTxt(pi);
  comprobar('sus cuentas van con el acuerdo de la flota', /tu parte 200,00/.test(hoyInv) && /Debes a la empresa 100,00/.test(hoyInv), hoyInv.slice(0, 120).replace(/\n/g, ' '));
  await pi.getByLabel('Ajustes').click(); await pi.waitForTimeout(300);
  const ajInv = await pi.locator('body').innerText();
  comprobar('y en Ajustes no puede cambiar el acuerdo', /TU FLOTA/i.test(ajInv) && /Taxis Prueba/.test(ajInv) && /no se puede cambiar desde aquí/.test(ajInv) && (await pi.locator('#cfgPct').count()) === 0 && (await pi.locator('#cfgCuota').count()) === 0);
  await pi.reload({ waitUntil: 'load' }); await pi.waitForSelector('text=INGRESOS DEL DÍA');
  await pi.getByLabel('Ajustes').click(); await pi.waitForTimeout(300);
  comprobar('el vínculo sigue al volver a abrir', (await pi.getByLabel('Tu flota').count()) === 1);
  await pi.getByRole('button', { name: 'Salir de la flota' }).click(); await pi.waitForTimeout(300);
  comprobar('si sale de la flota, vuelve a poner él su acuerdo', (await pi.getByLabel('Tu flota').count()) === 0 && (await pi.locator('#cfgPct').count()) === 1);
  comprobar('invitación sin errores', errInv.length === 0, errInv.join(' | '));
  // Un enlace roto o trucado no rompe nada: la app abre como siempre.
  await pi.goto('http://localhost:8080/index.html?alta=esto-no-es-una-invitacion', { waitUntil: 'load' });
  const abreIgual = await pi.waitForSelector('text=INGRESOS DEL DÍA', { timeout: 8000 }).then(() => true).catch(() => false);
  comprobar('una invitación rota se ignora', abreIgual && (await pi.getByLabel('Invitación a una flota').count()) === 0);
  await ci.close();

  console.log('\n— GASOLINERAS BARATAS —');
  // La lista del Ministerio, de mentira y pequeña: dos baratas (una lejos), una
  // cara pegada al conductor, una media, y dos filas rotas que hay que descartar.
  const eess = (o) => ({ 'C.P.': '28000', 'Dirección': o.dir, Horario: o.h || 'L-D: 24H', Latitud: o.lat, 'Longitud (WGS84)': o.lon, Municipio: o.muni || 'Madrid', PrecioProducto: o.precio, 'Rótulo': o.rotulo, IDEESS: o.id });
  const listaGas = { Fecha: '11/11/2026 21:00:00', ResultadoConsulta: 'OK', ListaEESSPrecio: [
    eess({ id: '1', rotulo: 'BARATA SUR', dir: 'CALLE UNO, 1', lat: '40,400000', lon: '-3,690000', precio: '1,400' }),
    eess({ id: '2', rotulo: 'CARA CERCA', dir: 'PASEO DOS, 2, ', lat: '40,407000', lon: '-3,689000', precio: '1,800', h: 'L-D: 06:00-22:00' }),
    eess({ id: '3', rotulo: 'LEJOS BARATA', dir: 'AVENIDA TRES, 3', lat: '40,480000', lon: '-3,370000', precio: '1,300', muni: 'Alcalá de Henares' }),
    eess({ id: '4', rotulo: 'SIN PRECIO', dir: 'CALLE CUATRO', lat: '40,410000', lon: '-3,690000', precio: '' }),
    eess({ id: '5', rotulo: 'SIN SITIO', dir: 'CALLE CINCO', lat: '', lon: '', precio: '1,100' }),
    eess({ id: '6', rotulo: 'MEDIA', dir: 'CALLE SEIS, 6', lat: '40,420000', lon: '-3,700000', precio: '1,600' }),
    'basura', null,
  ] };
  const listaDiesel = { ListaEESSPrecio: [eess({ id: '9', rotulo: 'SOLO DIESEL', dir: 'CALLE NUEVE, 9', lat: '40,405000', lon: '-3,690000', precio: '1,555' })] };
  const pedidasGas = [];
  let gasCortado = false;
  const rutaGas = async (c) => c.route('**/ServiciosRESTCarburantes/**', (r) => {
    const id = r.request().url().split('/').pop(); pedidasGas.push(id);
    if (gasCortado) return r.abort();
    return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(id === '4' ? listaDiesel : listaGas) });
  });
  const abrirGas = async (pg) => { await pg.getByRole('button', { name: 'Gastos', exact: true }).click(); await pg.waitForTimeout(250); await pg.getByRole('button', { name: /Gasolineras baratas/ }).click(); await pg.waitForSelector('[aria-label="La más barata"], [aria-label="Sin resultados"], [role="alert"]'); await pg.waitForTimeout(250); };
  // 1) Sin dar la ubicación: la más barata de toda la Comunidad.
  const cg = await b.newContext({ viewport: { width: 390, height: 800 }, locale: 'es-ES', timezoneId: 'Europe/Madrid', serviceWorkers: 'block' });
  await rutaGas(cg);
  const pgas = await cg.newPage(); const errGas = []; pgas.on('pageerror', (e) => errGas.push(e.message));
  await pgas.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
  await pgas.waitForSelector('text=INGRESOS DEL DÍA'); await pgas.waitForTimeout(400);
  comprobar('la app no consulta precios hasta que se abre Gasolineras', pedidasGas.length === 0, pedidasGas.join(','));
  await abrirGas(pgas);
  const sinPos = await pgas.getByLabel('La más barata').innerText();
  comprobar('sin ubicación: la más barata de la Comunidad', /LA MÁS BARATA DE LA COMUNIDAD DE MADRID/i.test(sinPos) && /1,300/.test(sinPos) && /LEJOS BARATA/.test(sinPos) && /Avenida Tres, 3 · Alcalá de Henares/.test(sinPos), sinPos.replace(/\n/g, ' ').slice(0, 130));
  comprobar('descarta las filas sin precio o sin sitio y saca la media y el ahorro', /media de las 4 gasolineras/.test(sinPos) && /1,525\s€\/l/.test(sinPos) && /40 litros aquí te ahorras 9,00\s€/.test(sinPos), sinPos.replace(/\n/g, ' ').slice(-120));
  comprobar('pide solo el combustible elegido (gasolina 95)', pedidasGas.join(',') === '1', pedidasGas.join(','));
  comprobar('el enlace lleva a la gasolinera en el mapa', (await pgas.getByLabel('La más barata').getByRole('link', { name: 'Cómo llegar' }).getAttribute('href')) === 'https://www.google.com/maps/dir/?api=1&destination=40.48,-3.37');
  await pgas.getByLabel('Buscar gasolinera').fill('alcala'); await pgas.waitForTimeout(200);
  const listaBusca = await pgas.getByLabel('Lista de gasolineras').innerText();
  comprobar('se puede buscar por municipio sin acentos', /LEJOS BARATA/.test(listaBusca) && !/BARATA SUR/.test(listaBusca));
  await pgas.getByLabel('Buscar gasolinera').fill('zzz'); await pgas.waitForTimeout(200);
  comprobar('si no hay ninguna, lo dice', (await pgas.getByLabel('Sin resultados').count()) === 1 && (await pgas.getByLabel('La más barata').count()) === 0);
  // Sin permiso de ubicación: lo explica y deja buscar a mano.
  await pgas.getByLabel('Buscar gasolinera').fill('');
  await pgas.getByRole('button', { name: 'Usar mi ubicación' }).click(); await pgas.waitForTimeout(500);
  comprobar('sin permiso de ubicación, lo explica', /no ha dado permiso de ubicación|No he podido saber dónde estás/.test(await pgas.getByLabel('Tu ubicación').innerText()));
  // Otro combustible: otra consulta y otra lista.
  await pgas.getByRole('button', { name: 'Diésel' }).click(); await pgas.waitForSelector('text=SOLO DIESEL');
  comprobar('al cambiar de combustible pide el otro', pedidasGas.join(',') === '1,4' && /1,555/.test(await pgas.getByLabel('La más barata').innerText()), pedidasGas.join(','));
  // Sin cobertura: enseña lo último que bajó, y avisa.
  gasCortado = true;
  await pgas.getByRole('button', { name: 'Actualizar precios' }).click(); await pgas.waitForSelector('[role="alert"]');
  comprobar('sin cobertura enseña los últimos precios y avisa', /No he podido actualizar los precios/.test(await pgas.locator('[role="alert"]').innerText()) && /1,555/.test(await pgas.getByLabel('La más barata').innerText()));
  await pgas.getByRole('button', { name: 'GLP' }).click(); await pgas.waitForSelector('[role="alert"]'); await pgas.waitForTimeout(200);
  comprobar('y si no hay nada guardado de ese combustible, deja reintentar', /No he podido bajar los precios/.test(await pgas.locator('[role="alert"]').innerText()) && (await pgas.getByRole('button', { name: 'Reintentar' }).count()) === 1 && (await pgas.getByLabel('La más barata').count()) === 0);
  gasCortado = false;
  await pgas.getByRole('button', { name: 'Reintentar' }).click(); await pgas.waitForSelector('[aria-label="La más barata"]');
  comprobar('al volver la cobertura, reintentar funciona', /1,300/.test(await pgas.getByLabel('La más barata').innerText()));
  await pgas.getByRole('button', { name: '‹ Gastos' }).click(); await pgas.waitForTimeout(250);
  comprobar('y se vuelve a Gastos', /Nuevo gasto/i.test(await pgas.locator('body').innerText()));
  comprobar('gasolineras sin errores', errGas.length === 0, errGas.join(' | '));
  await cg.close();

  // 2) Con ubicación (Atocha): solo las de alrededor, con su distancia.
  const cg2 = await b.newContext({ viewport: { width: 390, height: 800 }, locale: 'es-ES', timezoneId: 'Europe/Madrid', serviceWorkers: 'block', geolocation: { latitude: 40.4066, longitude: -3.6892 }, permissions: ['geolocation'] });
  await rutaGas(cg2);
  const pg2 = await cg2.newPage(); const errGas2 = []; pg2.on('pageerror', (e) => errGas2.push(e.message));
  await pg2.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
  await pg2.waitForSelector('text=INGRESOS DEL DÍA');
  await abrirGas(pg2); await pg2.waitForSelector('text=A MENOS DE 5 KM');
  const conPos = await pg2.getByLabel('La más barata').innerText();
  comprobar('con ubicación: la más barata de alrededor, con su distancia', /A MENOS DE 5 KM/i.test(conPos) && /1,400/.test(conPos) && /BARATA SUR/.test(conPos) && /a 7\d0 m/.test(conPos), conPos.replace(/\n/g, ' ').slice(0, 120));
  comprobar('la media y el ahorro son los de la zona', /media de las 3 gasolineras a menos de 5 km es 1,600\s€\/l/.test(conPos) && /te ahorras 8,00\s€/.test(conPos), conPos.replace(/\n/g, ' ').slice(-110));
  const ordenDe = async () => (await pg2.getByLabel('Lista de gasolineras').getByRole('link').allInnerTexts()).map((t) => t.split('\n')[0]).join(' > ');
  comprobar('ordenadas por precio', (await ordenDe()) === 'BARATA SUR > MEDIA > CARA CERCA', await ordenDe());
  const filaCara = await pg2.getByLabel('Lista de gasolineras').getByRole('link').nth(2).innerText();
  comprobar('cada una dice cuánto se aparta de la media y su horario', /Paseo Dos, 2 · Madrid/.test(filaCara) && /50 m · L-D: 06:00-22:00/.test(filaCara) && /1,800\s+\+0,200/.test(filaCara), filaCara.replace(/\n/g, ' '));
  await pg2.getByRole('button', { name: 'Más cerca' }).click(); await pg2.waitForTimeout(200);
  comprobar('o por cercanía', (await ordenDe()) === 'CARA CERCA > BARATA SUR > MEDIA', await ordenDe());
  await pg2.getByRole('button', { name: 'Abiertas 24 h' }).click(); await pg2.waitForTimeout(200);
  comprobar('el filtro de 24 h quita las que cierran', (await ordenDe()) === 'BARATA SUR > MEDIA' && /te ahorras 4,00\s€/.test(await pg2.getByLabel('La más barata').innerText()), await ordenDe());
  await pg2.getByRole('button', { name: 'Abiertas 24 h' }).click();
  await pg2.getByRole('button', { name: '2 km', exact: true }).click(); await pg2.waitForTimeout(200);
  comprobar('y la distancia acota la zona', /A MENOS DE 2 KM/i.test(await pg2.getByLabel('La más barata').innerText()) && (await ordenDe()) === 'CARA CERCA > BARATA SUR > MEDIA');
  // Lo elegido se recuerda; la ubicación no se guarda.
  const guardadoGas = await pg2.evaluate(() => ({ pref: localStorage.getItem('tc_gas'), todo: JSON.stringify(localStorage) }));
  comprobar('recuerda lo elegido y no guarda la ubicación', /"radio":2/.test(guardadoGas.pref) && /"orden":"cerca"/.test(guardadoGas.pref) && !/40\.4066/.test(guardadoGas.todo) && !/3\.6892/.test(guardadoGas.todo));
  comprobar('gasolineras con ubicación sin errores', errGas2.length === 0, errGas2.join(' | '));
  await cg2.close();

  console.log('\n— LLEGADAS AL AEROPUERTO —');
  // Mientras llegadas.json esté vacío (no hay quien lo rellene todavía), la
  // pantalla ni se ofrece. Con datos, se prueban con vuelos alrededor de ahora.
  const enMin = (m) => new Date(Date.now() + m * 60000).toISOString();
  const vuelo = (m, terminal, origen, extra) => ({ hora: enMin(m), prevista: enMin(m), terminal, origen, num: 'XX' + Math.abs(m), cia: 'Prueba Air', estado: '', ...(extra || {}) });
  const llegadasDe = (minActualizado) => ({ actualizado: enMin(minActualizado), vuelos: [
    vuelo(-40, 'T1', 'Hace Rato'), vuelo(-20, 'T4', 'Recién'),
    vuelo(10, 'T4S', 'Lima'), vuelo(20, 'T1', 'Roma', { prevista: enMin(50) }), vuelo(30, 'T2', 'París'),
    vuelo(40, 'T4', 'Cancelado', { estado: 'cancelado' }), vuelo(45, '3', 'Viena'), vuelo(90, 'T4', 'Miami'),
    { hora: 'nada', terminal: 'T4', origen: 'Roto' }, null, 'basura',
  ] });
  const ctxAero = await b.newContext({ viewport: { width: 390, height: 800 }, locale: 'es-ES', timezoneId: 'Europe/Madrid', serviceWorkers: 'block' });
  const pgAero = await ctxAero.newPage(); const errAero = []; pgAero.on('pageerror', (e) => errAero.push(e.message)); pgAero.on('console', (m) => { if (m.type() === 'error') errAero.push(m.text()); });
  await pgAero.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
  await pgAero.waitForSelector('text=INGRESOS DEL DÍA');
  const irACalendario = async () => { await pgAero.getByRole('button', { name: 'Diario', exact: true }).click(); await pgAero.waitForTimeout(150); await pgAero.getByRole('button', { name: 'Calendario', exact: true }).click(); await pgAero.waitForTimeout(500); };
  await irACalendario();
  comprobar('sin datos de vuelos, el Calendario no ofrece el aeropuerto', (await pgAero.getByRole('button', { name: /Llegadas al aeropuerto/ }).count()) === 0);
  await ctxAero.route('**/llegadas.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(llegadasDe(-240)) }));
  await irACalendario();
  comprobar('con datos de hace cuatro horas, tampoco', (await pgAero.getByRole('button', { name: /Llegadas al aeropuerto/ }).count()) === 0);
  await ctxAero.unroute('**/llegadas.json');
  await ctxAero.route('**/llegadas.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"actualizado": "ayer", "vuelos": "muchos"' }));
  await irACalendario();
  comprobar('un archivo roto no ofrece nada ni rompe la app', (await pgAero.getByRole('button', { name: /Llegadas al aeropuerto/ }).count()) === 0 && /día trabajado|días trabajados/.test(await pgAero.locator('body').innerText()));
  await ctxAero.unroute('**/llegadas.json');
  await ctxAero.route('**/llegadas.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(llegadasDe(-5)) }));
  await irACalendario();
  const tarjetaAero = pgAero.getByRole('button', { name: /Llegadas al aeropuerto/ });
  comprobar('con datos frescos, el Calendario dice cuántos vuelos llegan', (await tarjetaAero.count()) === 1 && /4 vuelos en la próxima hora/.test(await tarjetaAero.innerText()), (await tarjetaAero.count()) ? (await tarjetaAero.innerText()).replace(/\n/g, ' ') : 'no está');
  await tarjetaAero.click(); await pgAero.waitForSelector('[aria-label="Próxima hora"]');
  const horaTxtAero = (await pgAero.getByLabel('Próxima hora').innerText()).replace(/\s+/g, ' ');
  comprobar('la próxima hora por terminal: T4S cuenta como T4, T3 como T2, y los cancelados no', /EN LA PRÓXIMA HORA 4 vuelos T1 1 T2 2 T4 1/i.test(horaTxtAero), horaTxtAero.slice(0, 80));
  comprobar('y dice cuántos acaban de aterrizar', /Han aterrizado 1 vuelo en la última media hora/.test(horaTxtAero));
  const filasAero = async () => (await pgAero.getByLabel('Próximos vuelos').innerText()).replace(/\s+/g, ' ');
  const todasAero = await filasAero();
  comprobar('la lista va por hora prevista, sin cancelados ni filas rotas', /Lima .* París .* Viena .* Roma .* Miami/.test(todasAero) && !/Cancelado|Roto|Recién|Hace Rato/.test(todasAero), todasAero.slice(0, 160));
  comprobar('un retraso se ve, con su hora nueva', /Roma XX20 · Prueba Air · 30 min de retraso/.test(todasAero));
  await pgAero.getByLabel('Terminal').getByRole('button', { name: 'T4', exact: true }).click(); await pgAero.waitForTimeout(200);
  const soloT4 = await filasAero();
  comprobar('se puede mirar una sola terminal', /Lima .* Miami/.test(soloT4) && !/París|Roma|Viena/.test(soloT4) && /LAS PRÓXIMAS 12 HORAS · T4/i.test(await pgAero.getByLabel('Llegadas por hora').innerText()));
  const barras = (await pgAero.getByLabel('Llegadas por hora').innerText()).match(/\b\d+\b(?!h)/g) || [];
  comprobar('las barras suman los vuelos de esa terminal', /El pico de la T4/.test(await pgAero.getByLabel('Llegadas por hora').innerText()), barras.join(','));
  await pgAero.getByRole('button', { name: '‹ Calendario' }).click(); await pgAero.waitForTimeout(300);
  comprobar('y se vuelve al Calendario', /día trabajado|días trabajados/.test(await pgAero.locator('body').innerText()));
  comprobar('aeropuerto sin errores', errAero.length === 0, errAero.join(' | '));
  await ctxAero.close();

  console.log('\n— MODO OSCURO —');
  const fondo = (pg) => pg.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const oscuroSis = await b.newContext({ viewport: { width: 390, height: 800 }, locale: 'es-ES', colorScheme: 'dark' });
  await oscuroSis.addInitScript(() => { localStorage.setItem('tc_cfg_ok', '1'); localStorage.setItem('tc_aviso_play', JSON.stringify(Date.now())); });
  const pd = await oscuroSis.newPage();
  const errOsc = []; pd.on('pageerror', (e) => errOsc.push(e.message));
  await pd.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
  await pd.waitForSelector('text=INGRESOS DEL DÍA');
  comprobar('con el móvil en oscuro, la app sale oscura', (await fondo(pd)) === 'rgb(14, 16, 22)', await fondo(pd));
  await pd.getByLabel('Ajustes').click();
  await pd.waitForTimeout(400);
  await pd.getByRole('radio', { name: 'Claro' }).click();
  await pd.waitForTimeout(300);
  comprobar('en Ajustes se puede forzar claro', (await fondo(pd)) === 'rgb(245, 246, 250)', await fondo(pd));
  await pd.reload({ waitUntil: 'load' });
  await pd.waitForSelector('text=INGRESOS DEL DÍA');
  comprobar('y se queda en claro al volver a abrir', (await fondo(pd)) === 'rgb(245, 246, 250)', await fondo(pd));
  await oscuroSis.close();
  const claroSis = await b.newContext({ viewport: { width: 390, height: 800 }, locale: 'es-ES', colorScheme: 'light' });
  await claroSis.addInitScript(() => { localStorage.setItem('tc_cfg_ok', '1'); localStorage.setItem('tc_aviso_play', JSON.stringify(Date.now())); });
  const pl = await claroSis.newPage();
  pl.on('pageerror', (e) => errOsc.push(e.message));
  await pl.goto('http://localhost:8080/index.html', { waitUntil: 'load' });
  await pl.waitForSelector('text=INGRESOS DEL DÍA');
  comprobar('con el móvil en claro, la app sale clara', (await fondo(pl)) === 'rgb(245, 246, 250)', await fondo(pl));
  await pl.getByLabel('Ajustes').click();
  await pl.waitForTimeout(400);
  await pl.getByRole('radio', { name: 'Oscuro' }).click();
  await pl.waitForTimeout(300);
  const tarjetaOsc = await pl.getByText('Apariencia').locator('..').evaluate((el) => getComputedStyle(el).backgroundColor);
  comprobar('y se puede forzar oscuro: fondo y tarjetas', (await fondo(pl)) === 'rgb(14, 16, 22)' && tarjetaOsc === 'rgb(24, 27, 36)', `${await fondo(pl)} · ${tarjetaOsc}`);
  await pl.getByRole('button', { name: /Calendario/ }).last().click();
  await pl.waitForTimeout(500);
  await pl.getByRole('button', { name: /Diario/ }).last().click();
  await pl.waitForTimeout(300);
  const casilla = await pl.locator('input.inp').first().evaluate((el) => getComputedStyle(el).backgroundColor);
  comprobar('las casillas también se oscurecen', casilla === 'rgb(15, 18, 24)', casilla);
  comprobar('modo oscuro sin errores', errOsc.length === 0, errOsc.join(' | '));
  await claroSis.close();

  console.log('\n— RESULTADO —');
  console.log('errores de consola:', errores.length ? errores : 'ninguno');
  console.log('comprobaciones fallidas:', fallos.length ? fallos : 'ninguna');
  await b.close();
  process.exit(fallos.length || errores.length ? 1 : 0);
})();
