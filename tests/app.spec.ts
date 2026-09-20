import { expect, test } from '@playwright/test';

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
