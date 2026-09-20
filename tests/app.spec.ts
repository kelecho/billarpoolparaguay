import { expect, test, type Locator, type Page } from '@playwright/test';

test('crea un jugador y un torneo por categoría, sortea, juega y publica el fixture', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Agregar jugador' }).click();
  await page.getByLabel('Nombre y apellido').fill('María Prueba');
  await page.getByLabel('Ciudad', { exact: true }).fill('Asunción');
  await page.getByLabel('Categoría del jugador').selectOption('Principiante');
  await page.getByLabel('Puntos iniciales').fill('500');
  await page.getByRole('button', { name: 'Guardar jugador' }).click();
  await page.getByRole('button', { name: 'Principiante', exact: true }).click();
  await page.getByLabel('Buscar jugadores').fill('María Prueba');
  await expect(page.getByRole('row').filter({ hasText: 'María Prueba' }).getByRole('link')).toBeVisible();
  await page.getByRole('navigation').getByRole('link', { name: 'Torneos', exact: true }).click();
  await page.getByRole('button', { name: 'Crear torneo' }).click();
  await page.getByLabel('Nombre del torneo').fill('Copa de prueba');
  await page.getByLabel('Fecha', { exact: true }).fill('2025-01-15');
  await page.getByLabel('Categoría del torneo').selectOption('Principiante');
  await page.getByLabel('Partidas para ganar').fill('3');
  await page.getByLabel('Sede y ciudad').fill('Club de prueba');
  await page.getByRole('button', { name: 'Guardar torneo' }).click();
  const card = page.getByRole('article').filter({ hasText: 'Copa de prueba' });
  await card.getByRole('link', { name: 'Administrar torneo' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Inscribir a Diego Benítez', exact: true })).toHaveCount(0);
  for (const name of ['María Prueba', 'Camila Fernández', 'Pablo Giménez']) {
    await dialog.getByRole('button', { name: `Inscribir a ${name}`, exact: true }).click();
    await expect(dialog.getByRole('button', { name: `Quitar inscripción de ${name}`, exact: true })).toBeVisible();
  }
  await dialog.getByRole('button', { name: 'Realizar sorteo inicial' }).click();
  await expect(dialog.getByRole('region', { name: 'Fixture del torneo' })).toBeVisible();
  await expect(dialog.getByRole('article')).toHaveCount(3);
  await expect(dialog.getByText('Pase libre', { exact: true }).first()).toBeVisible();
  const initialOrder = await dialog.locator('.match-player').allTextContents();
  await page.reload();
  await expect(dialog.getByRole('region', { name: 'Fixture del torneo' })).toBeVisible();
  expect(await dialog.locator('.match-player').allTextContents()).toEqual(initialOrder);
  await dialog.getByRole('button', { name: 'Volver a sortear' }).click();
  await dialog.getByRole('button', { name: 'Confirmar nuevo sorteo' }).click();
  await expect(dialog.getByRole('button', { name: 'Volver a sortear' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Publicar resultados del torneo' })).toBeDisabled();

  const playable = dialog.getByRole('article').filter({ has: page.getByRole('button', { name: 'Cargar resultado', exact: true }) });
  for (let i = 0; i < 2; i++) {
    const match = playable.first();
    if (i === 0) {
      await match.getByRole('button', { name: 'Mesa y horario' }).click();
      await match.getByLabel('Mesa', { exact: true }).fill('2');
      await match.getByLabel('Hora del partido').fill('19:30');
      await match.getByRole('button', { name: 'Guardar programación' }).click();
      await expect(match).toContainText('Mesa 2 · 19:30 h');
    }
    await match.getByRole('button', { name: 'Cargar resultado', exact: true }).click();
    const inputs = match.getByRole('spinbutton');
    const firstName = await inputs.nth(0).getAttribute('aria-label');
    const secondName = await inputs.nth(1).getAttribute('aria-label');
    await inputs.nth(0).fill(secondName?.includes('María Prueba') ? '1' : '3');
    await inputs.nth(1).fill(firstName?.includes('María Prueba') || !secondName?.includes('María Prueba') ? '1' : '3');
    await match.getByRole('button', { name: 'Guardar resultado' }).click();
    await expect(dialog.getByRole('button', { name: 'Editar resultado', exact: true })).toHaveCount(i + 1);
  }
  await expect(dialog.getByRole('button', { name: 'Volver a sortear' })).toHaveCount(0);
  await expect(dialog.locator('.fixture-champion')).toContainText('María Prueba');
  await page.screenshot({ path: test.info().outputPath('fixture.png') });
  await dialog.getByRole('button', { name: 'Publicar resultados del torneo' }).click();
  await expect(dialog.getByRole('heading', { name: 'Clasificación final' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(card).toContainText('Finalizado');
  await page.getByRole('navigation').getByRole('link', { name: 'Ranking', exact: true }).click();
  await page.getByRole('button', { name: 'Principiante', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: 'María Prueba' }).locator('.score')).toContainText('800');
  await expect(page.getByRole('row').filter({ hasText: 'María Prueba' }).locator('.rank')).toHaveText('01');
  await page.getByRole('navigation').getByRole('link', { name: 'Torneos', exact: true }).click();
  await card.getByRole('link', { name: 'Ver resultados' }).click();
  await dialog.getByRole('button', { name: 'Corregir resultados' }).click();
  await page.getByLabel('Motivo de la corrección').fill('Error en el puesto');
  await page.getByRole('button', { name: 'Reabrir torneo' }).click();
  await expect(dialog.getByRole('region', { name: 'Fixture del torneo' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('navigation').getByRole('link', { name: 'Ranking', exact: true }).click();
  await page.getByRole('button', { name: 'Principiante', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: 'María Prueba' }).locator('.score')).toContainText('500');
});

test('filtra, muestra perfiles y no desborda la pantalla', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: test.info().outputPath('ranking.png'), fullPage: true });
  await page.getByRole('button', { name: 'Principiante', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: 'Diego Benítez' })).toHaveCount(0);
  await page.getByRole('link', { name: /Camila Fernández/ }).click();
  await expect(page.getByRole('dialog')).toContainText('Perfil del jugador');
  await expect(page).toHaveURL(/jugador=p11/);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).not.toHaveURL(/jugador=/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('respalda, solicita confirmación al reemplazar y rechaza archivos inválidos', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('navigation').getByRole('link', { name: 'Configuración' }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar respaldo' }).click();
  const backup = await downloaded;
  expect(backup.suggestedFilename()).toMatch(/pool-paraguay.*\.json/);
  const backupPath = await backup.path();
  await page.getByLabel('Archivo de respaldo').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
  await expect(page.getByRole('alert')).toContainText('Los datos no son válidos');
  await page.getByRole('button', { name: 'Empezar desde cero' }).click();
  await page.getByRole('button', { name: 'Confirmar reemplazo' }).click();
  await page.reload();
  await page.getByRole('navigation').getByRole('link', { name: 'Ranking', exact: true }).click();
  await expect(page.getByText('El primer puesto está disponible')).toBeVisible();
  await expect(page.getByText('Estás explorando datos de ejemplo.')).toHaveCount(0);
  await page.getByRole('navigation').getByRole('link', { name: 'Configuración' }).click();
  await page.getByLabel('Archivo de respaldo').setInputFiles(backupPath!);
  await expect(page.getByRole('dialog')).toContainText('12 jugadores y 5 torneos');
  await page.getByRole('button', { name: 'Confirmar reemplazo' }).click();
  await page.reload();
  await page.getByRole('navigation').getByRole('link', { name: 'Ranking', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: 'Diego Benítez' })).toBeVisible();
});

test('protege datos locales dañados y permite recuperar un respaldo', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pool-paraguay-state-v1', '{datos dañados'));
  await page.goto('/');
  await expect(page.getByText(/Los cambios están bloqueados/)).toBeVisible();
  await page.getByRole('navigation').getByRole('link', { name: 'Configuración' }).click();
  await expect(page.getByRole('button', { name: 'Exportar datos originales' })).toBeVisible();
  await page.getByRole('button', { name: 'Guardar reglas' }).click();
  expect(await page.evaluate(() => localStorage.getItem('pool-paraguay-state-v1'))).toBe('{datos dañados');
});

test('carga el ranking sin conexión después de instalar el service worker', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  // Con actualizaciones manuales, el primer worker controla la siguiente navegación.
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'El ranking', exact: true })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'Diego Benítez' })).toBeVisible();
});

test('muestra podio, ranking por disciplina y abre perfiles y torneos desde un enlace', async ({ page }) => {
  await page.goto('/#/?jugador=p1');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Diego Benítez');
  await expect(dialog.getByRole('img', { name: /Evolución de puntos/ })).toBeVisible();
  await dialog.getByRole('link', { name: /Clásico de Luque/ }).click();
  await expect(dialog).toContainText('Club Luque · Luque');
  await page.keyboard.press('Escape');
  await page.getByRole('navigation').getByRole('link', { name: 'Ranking', exact: true }).click();
  await page.getByRole('button', { name: 'Todas', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Podio del ranking general' }).getByRole('listitem')).toHaveCount(3);
  await page.getByRole('button', { name: 'Bola 10', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: 'Matías Villalba' })).toContainText('300');
  await expect(page.getByRole('row').filter({ hasText: 'Camila Fernández' })).toHaveCount(0);
});

test('elimina un jugador sin resultados y protege a quienes ya compitieron', async ({ page }) => {
  await page.goto('/#/jugadores?jugador=p11');
  await page.getByRole('button', { name: 'Editar jugador' }).click();
  await page.getByRole('button', { name: 'Eliminar jugador' }).click();
  await page.getByRole('button', { name: 'Confirmar: eliminar jugador' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Camila Fernández/ })).toHaveCount(0);
  await page.goto('/#/jugadores?jugador=p1');
  await page.getByRole('button', { name: 'Editar jugador' }).click();
  await page.getByRole('button', { name: 'Eliminar jugador' }).click();
  await page.getByRole('button', { name: 'Confirmar: eliminar jugador' }).click();
  await expect(page.getByRole('alert')).toContainText('resultados publicados');
});

test('alterna el tema oscuro y recuerda la elección', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Cambiar a tema oscuro' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('button', { name: 'Cambiar a tema claro' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('carga, conserva, cambia y quita la foto del jugador y muestra su insignia', async ({ page }) => {
  await page.goto('/#/jugadores?jugador=p1');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('img', { name: 'Insignia de Primera', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Editar jugador' }).click();
  const upload = page.getByLabel('Foto del jugador (opcional)');
  await upload.setInputFiles('public/icon-512.png');
  await expect(dialog.getByRole('img', { name: 'Foto de Diego Benítez', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Guardar jugador' }).click();
  await expect(dialog.getByRole('heading', { name: 'Diego Benítez' })).toBeVisible();
  await page.reload();
  const photo = dialog.getByRole('img', { name: 'Foto de Diego Benítez', exact: true });
  await expect(photo).toBeVisible();
  const original = await photo.getAttribute('src');
  expect(original).toMatch(/^data:image\/jpeg;base64,/);
  expect(original!.length).toBeLessThanOrEqual(64 * 1024);
  expect(await photo.evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight])).toEqual([384, 384]);
  await page.screenshot({ path: test.info().outputPath('profile-badge-photo.png') });

  // Guardar otros campos conserva la foto; una nueva selección la reemplaza.
  await dialog.getByRole('button', { name: 'Editar jugador' }).click();
  await page.getByLabel('Club (opcional)').fill('Club de la foto');
  await page.getByRole('button', { name: 'Guardar jugador' }).click();
  await expect(photo).toHaveAttribute('src', original!);
  await dialog.getByRole('button', { name: 'Editar jugador' }).click();
  await upload.setInputFiles('public/icon-192.png');
  await expect(dialog.getByRole('button', { name: 'Quitar foto' })).toBeEnabled();
  await page.getByRole('button', { name: 'Guardar jugador' }).click();
  await expect(photo).not.toHaveAttribute('src', original!);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('link', { name: /Diego Benítez/ }).getByRole('img', { name: 'Foto de Diego Benítez' })).toBeVisible();
  await page.goto('/#/jugadores?jugador=p1');
  await dialog.getByRole('button', { name: 'Editar jugador' }).click();
  await page.getByRole('button', { name: 'Quitar foto' }).click();
  await page.getByRole('button', { name: 'Guardar jugador' }).click();
  await expect(photo).toHaveCount(0);
  await page.reload();
  await expect(dialog.getByRole('heading', { name: 'Diego Benítez' })).toBeVisible();
  await expect(photo).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('rechaza imágenes inválidas sin perder la foto anterior y cancela cambios sin guardarlos', async ({ page }) => {
  await page.goto('/#/jugadores?jugador=p11');
  await page.getByRole('button', { name: 'Editar jugador' }).click();
  const upload = page.getByLabel('Foto del jugador (opcional)');
  await upload.setInputFiles('public/icon-192.png');
  const photo = page.getByRole('dialog').getByRole('img', { name: 'Foto de Camila Fernández' });
  await expect(photo).toBeVisible();
  const original = await photo.getAttribute('src');
  await upload.setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('no es una imagen') });
  await expect(page.getByRole('alert')).toContainText('No se pudo abrir la imagen');
  await expect(photo).toHaveAttribute('src', original!);
  await upload.setInputFiles({ name: 'large.png', mimeType: 'image/png', buffer: Buffer.alloc(8 * 1024 * 1024 + 1) });
  await expect(page.getByRole('alert')).toContainText('supera los 8 MB');
  await upload.setInputFiles({ name: 'vector.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') });
  await expect(page.getByRole('alert')).toContainText('JPG, PNG o WebP');
  await page.keyboard.press('Escape');
  await page.goto('/#/jugadores?jugador=p11');
  await expect(photo).toHaveCount(0);
  await expect(page.getByRole('dialog').getByRole('img', { name: 'Insignia de Principiante' })).toBeVisible();
});

test('las insignias siguen la categoría y los filtros muestran Segunda y Tercera', async ({ page }) => {
  await page.goto('/');
  for (const category of ['Segunda', 'Tercera']) {
    const filter = page.getByRole('button', { name: category, exact: true });
    await expect(filter.locator('img')).toBeVisible();
    await filter.click();
    const row = page.locator('tbody tr').first();
    await expect(row.getByRole('img', { name: `Insignia de ${category}` })).toBeVisible();
    await row.getByRole('link').click();
    await expect(page.getByRole('dialog').getByRole('img', { name: `Insignia de ${category}` })).toBeVisible();
    await page.keyboard.press('Escape');
  }
});

test('juega un torneo de doble eliminación: ganadores, perdedores y gran final a partido único', async ({ page }) => {
  await page.goto('/#/torneos');
  await page.getByRole('button', { name: 'Crear torneo' }).click();
  await page.getByLabel('Nombre del torneo').fill('Copa doble');
  await page.getByLabel('Fecha', { exact: true }).fill('2025-02-01');
  await page.getByLabel('Categoría del torneo').selectOption('Segunda');
  await page.getByLabel('Partidas para ganar').fill('2');
  await expect(page.getByLabel('Clasifican a la fase final')).toHaveCount(0);
  await page.getByLabel('Formato').selectOption('double');
  await expect(page.getByLabel('Clasifican a la fase final')).toHaveValue('2');
  await page.getByLabel('Sede y ciudad').fill('Club doble');
  await page.getByRole('button', { name: 'Guardar torneo' }).click();
  await page.getByRole('article').filter({ hasText: 'Copa doble' }).getByRole('link', { name: 'Administrar torneo' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Doble eliminación · gran final a partido único');
  for (const name of ['Alejandro Vera', 'Carlos Acosta', 'Santiago Rojas']) {
    await dialog.getByRole('button', { name: `Inscribir a ${name}`, exact: true }).click();
    await expect(dialog.getByRole('button', { name: `Quitar inscripción de ${name}`, exact: true })).toBeVisible();
  }
  await dialog.getByLabel('Armado de cruces').selectOption('ranking');
  await dialog.getByRole('button', { name: 'Generar emparejamientos' }).click();
  // Cada llave tiene su pestaña con el avance; se abre en la que tiene partidos por jugar.
  await expect(dialog.getByRole('tab', { name: /ganadores/i })).toHaveAttribute('aria-selected', 'true');
  await expect(dialog.getByRole('tab', { name: /ganadores/i })).toContainText('1 por jugar');
  for (const name of [/perdedores/i, /Gran final/, /ganadores/i]) {
    await dialog.getByRole('tab', { name }).click();
    await expect(dialog.getByRole('tabpanel').getByRole('region')).toBeVisible();
  }
  await expect(dialog).toContainText('0/4 partidos disputados');
  // Cada lugar sin definir dice de qué partido sale, también cuando viene de la otra llave.
  await dialog.getByRole('tab', { name: /perdedores/i }).click();
  await expect(dialog.getByRole('article', { name: 'Partido P2-1', exact: true })).toContainText('Ganador de P1-1');
  await expect(dialog.getByRole('article', { name: 'Partido P2-1', exact: true })).toContainText('Perdedor de G2-1');
  await expect(dialog.getByRole('article', { name: 'Partido P1-1', exact: true })).toContainText('Perdedor de G1-2');
  await dialog.getByRole('tab', { name: /Gran final/ }).click();
  await expect(dialog.getByRole('article', { name: 'Partido F1-1', exact: true })).toContainText('Ganador de G2-1');
  await dialog.getByRole('tab', { name: /ganadores/i }).click();
  await expect(dialog.locator('.round-merge .fixture-cell')).toHaveCount(2);

  // Con el formato fijado por el fixture, el formulario ya no deja cambiarlo.
  await dialog.getByRole('button', { name: 'Editar torneo' }).click();
  await expect(page.getByLabel('Formato')).toBeDisabled();
  await expect(page.getByLabel('Clasifican a la fase final')).toBeDisabled();
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await page.getByRole('article').filter({ hasText: 'Copa doble' }).getByRole('link', { name: 'Administrar torneo' }).click();

  // Gana siempre quien figura primero: la cabeza de serie llega invicta a la gran final.
  for (const id of ['G1-2', 'G2-1', 'P2-1', 'F1-1']) {
    await dialog.getByRole('tab', { name: { G: /ganadores/i, P: /perdedores/i, F: /Gran final/ }[id[0]]! }).click();
    const match = dialog.getByRole('article', { name: `Partido ${id}`, exact: true });
    await match.getByRole('button', { name: 'Cargar resultado', exact: true }).click();
    await match.getByRole('spinbutton').nth(0).fill('2');
    await match.getByRole('spinbutton').nth(1).fill('1');
    await match.getByRole('button', { name: 'Guardar resultado' }).click();
    await expect(match.getByRole('button', { name: 'Editar resultado' })).toBeVisible();
  }
  // Quien perdió en ganadores volvió por la llave de perdedores y jugó la final.
  const final = dialog.getByRole('article', { name: 'Partido F1-1', exact: true });
  await expect(final).toContainText('Alejandro Vera');
  await expect(final).toContainText('Santiago Rojas');
  // El marcador muestra una bolita por partida y resalta al ganador.
  await expect(final.locator('.match-winner .match-beads i.on')).toHaveCount(2);
  await expect(final.locator('.match-loser .match-beads i.on')).toHaveCount(1);
  await dialog.getByRole('tab', { name: /perdedores/i }).click();
  await expect(dialog.getByRole('article', { name: 'Partido P1-1', exact: true })).toContainText('Pase libre');
  await expect(dialog).toContainText('4/4 partidos disputados');
  await expect(dialog).toContainText('Ganador del torneo');

  await dialog.getByRole('button', { name: 'Publicar resultados del torneo' }).click();
  await expect(dialog.getByRole('heading', { name: 'Clasificación final' })).toBeVisible();
  const places = await dialog.locator('.result-list li strong').allTextContents();
  expect(places).toEqual(['1.º', '2.º', '3.º']);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('agrega el banner del evento sin recortarlo, lo muestra en la tarjeta y el torneo, y lo cambia con resultados publicados', async ({ page }) => {
  await page.goto('/#/torneos');
  await page.getByRole('button', { name: 'Crear torneo' }).click();
  await page.getByLabel('Nombre del torneo').fill('Copa con afiche');
  await page.getByLabel('Categoría del torneo').selectOption('Primera');
  await page.getByLabel('Sede y ciudad').fill('Club del afiche');
  await page.getByLabel('Banner del evento (opcional)').setInputFiles('public/icon.svg');
  await expect(page.getByRole('alert')).toContainText('Elegí una imagen JPG, PNG o WebP');
  await page.getByLabel('Banner del evento (opcional)').setInputFiles('tests/fixtures/banner.jpg');
  const preview = page.getByRole('img', { name: 'Vista previa del banner' });
  await expect(preview).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  // El afiche es vertical (1080 × 1350) y conserva esa proporción.
  const ratio = await preview.evaluate((img: HTMLImageElement) => img.naturalWidth / img.naturalHeight);
  expect(ratio).toBeCloseTo(1080 / 1350, 2);
  await page.getByRole('button', { name: 'Guardar torneo' }).click();

  const card = page.getByRole('article').filter({ hasText: 'Copa con afiche' });
  await expect(card.locator('.card-banner')).toBeVisible();
  await card.getByRole('link', { name: 'Administrar torneo' }).click();
  await expect(page.getByRole('dialog').getByRole('img', { name: 'Banner de Copa con afiche' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('dialog').getByRole('img', { name: 'Banner de Copa con afiche' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  // Un torneo con resultados publicados ya no se edita, pero su banner sí.
  await page.goto('/#/torneos');
  await page.getByRole('article').filter({ hasText: 'Encuentro del Sur' }).getByRole('link', { name: 'Ver resultados' }).click();
  const finished = page.getByRole('dialog');
  await expect(finished.getByRole('button', { name: 'Editar torneo' })).toHaveCount(0);
  await finished.getByRole('button', { name: 'Agregar banner' }).click();
  await finished.getByLabel('Banner del evento (opcional)').setInputFiles('tests/fixtures/banner.jpg');
  await finished.getByRole('button', { name: 'Guardar banner' }).click();
  await expect(finished.getByRole('img', { name: 'Banner de Encuentro del Sur' })).toBeVisible();
  await expect(finished.getByRole('heading', { name: 'Clasificación final' })).toBeVisible();
  await finished.getByRole('button', { name: 'Cambiar banner' }).click();
  await finished.getByRole('button', { name: 'Quitar banner' }).click();
  await finished.getByRole('button', { name: 'Guardar banner' }).click();
  await expect(finished.getByRole('img', { name: 'Banner de Encuentro del Sur' })).toHaveCount(0);
});

test.describe('instalación en el dispositivo', () => {
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

  test('guía desde el pie de página para orientar a cualquier teléfono', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Instalar la app' }).click();
    const dialog = page.getByRole('dialog', { name: 'Instalar en tu dispositivo' });
    await dialog.getByRole('tab', { name: 'iPhone o iPad' }).click();
    await expect(dialog.getByRole('listitem')).toHaveCount(4);
    await expect(dialog).toContainText('Agregar a inicio');
    await expect(dialog).toContainText('Safari');
    await dialog.getByRole('tab', { name: 'Android' }).click();
    await expect(dialog).toContainText('Instalar app');
    await dialog.getByRole('tab', { name: 'Computadora' }).click();
    await expect(dialog).toContainText('barra de direcciones');
  });

  test('en iPhone ofrece la guía paso a paso y recuerda si se cierra el aviso', async ({ browser }) => {
    const context = await browser.newContext({ userAgent: IPHONE, viewport: { width: 390, height: 844 }, hasTouch: true });
    const page = await context.newPage();
    await page.goto('/');
    const banner = page.locator('.install-banner');
    await expect(banner).toContainText('Llevá el ranking en tu celular');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await banner.getByRole('button', { name: 'Cómo instalar' }).click();
    const dialog = page.getByRole('dialog', { name: 'Instalar en tu dispositivo' });
    await expect(dialog.getByRole('tab', { name: 'iPhone o iPad' })).toHaveAttribute('aria-selected', 'true');
    await expect(dialog.getByRole('button', { name: 'Instalar ahora' })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await banner.getByRole('button', { name: 'Cerrar el aviso de instalación' }).click();
    await expect(banner).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'El ranking', exact: true })).toBeVisible();
    await expect(banner).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Instalar la app' })).toBeVisible();
    await context.close();
  });

  test('instala de un toque cuando el navegador lo ofrece y deja de sugerirlo una vez instalada', async ({ page }, testInfo) => {
    await page.goto('/');
    // Chrome avisa con este evento cuando la página cumple los requisitos; acá se lo simula.
    const offer = (outcome: string) => page.evaluate(result => {
      const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt: async () => { (window as any).prompted = ((window as any).prompted ?? 0) + 1; }, userChoice: Promise.resolve({ outcome: result }) });
      window.dispatchEvent(event);
    }, outcome);
    const mobile = testInfo.project.name === 'mobile';
    const start = async () => mobile ? page.locator('.install-banner').getByRole('button', { name: 'Instalar', exact: true }).click() : (await page.getByRole('button', { name: 'Instalar la app' }).click(), page.getByRole('dialog').getByRole('button', { name: 'Instalar ahora' }).click());

    // Si la persona rechaza el diálogo del navegador, queda la guía a mano.
    await offer('dismissed');
    await start();
    await expect(page.getByRole('dialog', { name: 'Instalar en tu dispositivo' })).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Cerrar', exact: true }).click();

    await offer('accepted');
    await start();
    await expect(page.getByRole('status')).toContainText('BillarPool quedó instalada');
    expect(await page.evaluate(() => (window as any).prompted)).toBe(2);
    await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
    await expect(page.getByRole('button', { name: 'Instalar la app' })).toHaveCount(0);
    await expect(page.locator('.install-banner')).toHaveCount(0);
  });
});

test.describe('sorteo con suspenso', () => {
  test.use({ contextOptions: { reducedMotion: 'no-preference' } });

  test('gira el bolillero, revela los cruces de a uno y muestra exactamente lo que quedó guardado', async ({ page }) => {
    test.slow();
    await page.goto('/#/torneos');
    await page.getByRole('button', { name: 'Crear torneo' }).click();
    await page.getByLabel('Nombre del torneo').fill('Copa del bolillero');
    await page.getByLabel('Fecha', { exact: true }).fill('2025-02-01');
    await page.getByLabel('Categoría del torneo').selectOption('Segunda');
    await page.getByLabel('Sede y ciudad').fill('Club del sorteo');
    await page.getByRole('button', { name: 'Guardar torneo' }).click();
    await page.getByRole('article').filter({ hasText: 'Copa del bolillero' }).getByRole('link', { name: 'Administrar torneo' }).click();
    const dialog = page.getByRole('dialog');
    const entrants = ['Alejandro Vera', 'Carlos Acosta', 'Santiago Rojas', 'Miguel Duarte'];
    for (const name of entrants) {
      await dialog.getByRole('button', { name: `Inscribir a ${name}`, exact: true }).click();
      await expect(dialog.getByRole('button', { name: `Quitar inscripción de ${name}`, exact: true })).toBeVisible();
    }
    await dialog.getByRole('button', { name: 'Realizar sorteo inicial' }).click();

    // Mientras gira, el fixture no está a la vista y los nombres van pasando.
    const draw = dialog.getByRole('region', { name: 'Sorteo de los cruces' });
    await expect(draw.getByRole('status')).toHaveText('Girando el bolillero…');
    await expect(dialog.getByRole('region', { name: 'Fixture del torneo' })).toHaveCount(0);
    const rolling = draw.locator('.draw-name').first();
    const seen = new Set<string>();
    await expect.poll(async () => { seen.add(await rolling.innerText()); return seen.size; }, { intervals: [60] }).toBeGreaterThan(1);
    await expect(draw.locator('.draw-out')).toHaveCount(0);

    await expect(draw.getByRole('status')).toHaveText('Saliendo los cruces…', { timeout: 6000 });
    await expect(draw.getByRole('status')).toHaveText('Sorteo listo', { timeout: 12000 });
    await expect(draw.locator('.draw-out')).toHaveCount(4);
    const revealed = await draw.locator('.draw-name').allInnerTexts();
    expect([...revealed].sort()).toEqual([...entrants].sort());

    await draw.getByRole('button', { name: 'Ver el fixture' }).click();
    const firstRound = dialog.getByRole('region', { name: 'Fixture del torneo' }).locator('.fixture-round').first().locator('.match-name');
    expect(await firstRound.allInnerTexts()).toEqual(revealed);

    // Cualquiera puede volver a verlo; saltarlo lleva directo al mismo fixture.
    await dialog.getByRole('button', { name: 'Ver el sorteo otra vez' }).click();
    await expect(draw.getByRole('status')).toHaveText('Girando el bolillero…');
    await draw.getByRole('button', { name: 'Saltar la animación' }).click();
    expect(await firstRound.allInnerTexts()).toEqual(revealed);
    await page.reload();
    expect(await firstRound.allInnerTexts()).toEqual(revealed);
  });
});

test.describe('definición del torneo', () => {
  async function createTournament(page: Page, name: string, configure: () => Promise<void>) {
    await page.goto('/#/torneos');
    await page.getByRole('button', { name: 'Crear torneo' }).click();
    await page.getByLabel('Nombre del torneo').fill(name);
    await page.getByLabel('Fecha', { exact: true }).fill('2025-02-01');
    await page.getByLabel('Categoría del torneo').selectOption('Segunda');
    await page.getByLabel('Partidas para ganar').fill('2');
    await page.getByLabel('Sede y ciudad').fill('Club de la final');
    await configure();
    await page.getByRole('button', { name: 'Guardar torneo' }).click();
    await page.getByRole('article').filter({ hasText: name }).getByRole('link', { name: 'Administrar torneo' }).click();
  }
  async function score(dialog: Locator, id: string, a: number, b: number) {
    const match = dialog.getByRole('article', { name: `Partido ${id}`, exact: true });
    await match.getByRole('button', { name: 'Cargar resultado', exact: true }).click();
    await match.getByRole('spinbutton').nth(0).fill(String(a));
    await match.getByRole('spinbutton').nth(1).fill(String(b));
    await match.getByRole('button', { name: 'Guardar resultado' }).click();
    await expect(match.getByRole('button', { name: 'Editar resultado' })).toBeVisible();
  }
  async function enter(dialog: Locator, names: string[]) {
    for (const name of names) {
      await dialog.getByRole('button', { name: `Inscribir a ${name}`, exact: true }).click();
      await expect(dialog.getByRole('button', { name: `Quitar inscripción de ${name}`, exact: true })).toBeVisible();
    }
    await dialog.getByLabel('Armado de cruces').selectOption('ranking');
    await dialog.getByRole('button', { name: 'Generar emparejamientos' }).click();
  }

  test('juega el partido por el tercer puesto y no publica hasta que se define', async ({ page }) => {
    await createTournament(page, 'Copa con tercero', async () => {
      await expect(page.getByLabel(/Revancha en la gran final/)).toHaveCount(0);
      await page.getByLabel(/Partido por el tercer puesto/).check();
    });
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Eliminación directa · con partido por el tercer puesto');
    await enter(dialog, ['Alejandro Vera', 'Carlos Acosta', 'Santiago Rojas', 'Miguel Duarte']);
    const third = dialog.getByRole('region', { name: 'Tercer puesto' });
    await expect(third.getByRole('article', { name: 'Partido T1-1', exact: true })).toContainText('Perdedor de 1-1');
    await expect(dialog).toContainText('0/4 partidos disputados');
    for (const id of ['1-1', '1-2', '2-1']) await score(dialog, id, 2, 0);
    // La final está jugada y ya hay campeón a la vista, pero falta un partido.
    await expect(dialog).toContainText('3/4 partidos disputados');
    await expect(dialog.locator('.fixture-champion')).toContainText('Alejandro Vera');
    await expect(dialog.getByRole('button', { name: 'Publicar resultados del torneo' })).toBeDisabled();
    // Con cabezas de serie se cruzan 1.º con 4.º y 2.º con 3.º: por el tercer puesto juegan los dos que cayeron.
    await expect(third).toContainText('Miguel Duarte');
    await expect(third).toContainText('Santiago Rojas');
    await score(dialog, 'T1-1', 1, 2);
    await expect(dialog).toContainText('4/4 partidos disputados');
    await dialog.getByRole('button', { name: 'Publicar resultados del torneo' }).click();
    const results = dialog.locator('.result-list li');
    await expect(results).toHaveCount(4);
    expect(await results.locator('strong').allTextContents()).toEqual(['1.º', '2.º', '3.º', '4.º']);
    await expect(results.nth(2)).toContainText('Santiago Rojas');
    await expect(results.nth(2)).toContainText('+150');
    await expect(results.nth(3)).toContainText('+100');
  });

  test('juega la revancha de la gran final cuando pierde el invicto', async ({ page }) => {
    await createTournament(page, 'Copa con revancha', async () => {
      await page.getByLabel('Formato').selectOption('double');
      // La opción cambia con el formato: con fase final de cuatro vuelve a ser el tercer puesto.
      await expect(page.getByLabel(/Partido por el tercer puesto/)).toHaveCount(0);
      await page.getByLabel('Clasifican a la fase final').selectOption('4');
      await expect(page.getByLabel(/Partido por el tercer puesto/)).toBeVisible();
      await page.getByLabel('Clasifican a la fase final').selectOption('2');
      await page.getByLabel(/Revancha en la gran final/).check();
    });
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Doble eliminación · gran final con revancha');
    await enter(dialog, ['Alejandro Vera', 'Carlos Acosta', 'Santiago Rojas']);
    await score(dialog, 'G1-2', 2, 0);
    await score(dialog, 'G2-1', 2, 0);
    await dialog.getByRole('tab', { name: /perdedores/i }).click();
    await score(dialog, 'P2-1', 2, 0);
    await dialog.getByRole('tab', { name: /Gran final/ }).click();
    const rematch = dialog.getByRole('article', { name: 'Partido F2-1', exact: true });
    await expect(rematch).toContainText('Si pierde el invicto');
    await expect(rematch.getByRole('button', { name: 'Cargar resultado', exact: true })).toHaveCount(0);

    // Gana quien viene de perdedores: es la primera derrota del invicto, así que todavía no hay campeón.
    await score(dialog, 'F1-1', 0, 2);
    await expect(rematch).toContainText('Por jugar');
    await expect(dialog).toContainText('4/5 partidos disputados');
    await expect(dialog.getByText('Ganador del torneo')).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Publicar resultados del torneo' })).toBeDisabled();
    await score(dialog, 'F2-1', 2, 1);
    await expect(dialog.locator('.fixture-champion')).toContainText('Alejandro Vera');

    // Si en cambio la gran final la hubiera ganado el invicto, la revancha no se juega: hay que quitarla antes de corregir.
    const final = dialog.getByRole('article', { name: 'Partido F1-1', exact: true });
    await final.getByRole('button', { name: 'Editar resultado' }).click();
    await final.getByRole('spinbutton').nth(0).fill('2');
    await final.getByRole('spinbutton').nth(1).fill('0');
    await final.getByRole('button', { name: 'Guardar resultado' }).click();
    await expect(page.getByRole('alert')).toContainText('Primero quitá los resultados de las rondas posteriores');
    await rematch.getByRole('button', { name: 'Editar resultado' }).click();
    await rematch.getByRole('button', { name: 'Quitar resultado' }).click();
    await rematch.getByRole('button', { name: 'Confirmar: quitar resultado' }).click();
    await final.getByRole('button', { name: 'Guardar resultado' }).click();
    await expect(rematch).toContainText('No hizo falta');
    await expect(dialog).toContainText('4/4 partidos disputados');
    await dialog.getByRole('button', { name: 'Publicar resultados del torneo' }).click();
    expect(await dialog.locator('.result-list li strong').allTextContents()).toEqual(['1.º', '2.º', '3.º']);
  });
});
