import { expect, test } from '@playwright/test';

test('crea un jugador y un torneo, publica y corrige resultados, conserva los cambios', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Agregar jugador' }).click();
  await page.getByLabel('Nombre y apellido').fill('María Prueba');
  await page.getByLabel('Ciudad', { exact: true }).fill('Asunción');
  await page.getByRole('button', { name: 'Guardar jugador' }).click();
  await page.getByLabel('Buscar jugadores').fill('María Prueba');
  await expect(page.getByRole('link', { name: /María Prueba/ })).toBeVisible();
  await page.getByRole('navigation').getByRole('link', { name: 'Torneos', exact: true }).click();
  await page.getByRole('button', { name: 'Crear torneo' }).click();
  await page.getByLabel('Nombre del torneo').fill('Copa de prueba');
  await page.getByLabel('Fecha', { exact: true }).fill('2025-01-15');
  await page.getByLabel('Sede y ciudad').fill('Club de prueba');
  await page.getByRole('button', { name: 'Guardar torneo' }).click();
  const card = page.getByRole('article').filter({ hasText: 'Copa de prueba' });
  await card.getByRole('button', { name: 'Cargar resultados' }).click();
  await page.getByLabel('Jugador 1', { exact: true }).selectOption({ label: 'María Prueba' });
  await page.getByRole('button', { name: 'Publicar resultados' }).click();
  await expect(card).toContainText('Finalizado');
  await page.reload();
  await page.getByRole('navigation').getByRole('link', { name: 'Ranking', exact: true }).click();
  await page.getByLabel('Buscar jugadores').fill('María Prueba');
  await expect(page.getByRole('row').filter({ hasText: 'María Prueba' })).toContainText('300');
  await page.getByRole('navigation').getByRole('link', { name: 'Torneos', exact: true }).click();
  await card.getByRole('link', { name: 'Ver resultados' }).click();
  await page.getByRole('button', { name: 'Corregir resultados' }).click();
  await page.getByLabel('Motivo de la corrección').fill('Error en el puesto');
  await page.getByRole('button', { name: 'Reabrir torneo' }).click();
  await expect(card).toContainText('Sin resultados');
  await page.getByRole('navigation').getByRole('link', { name: 'Ranking', exact: true }).click();
  await page.getByLabel('Buscar jugadores').fill('María Prueba');
  await expect(page.getByRole('row').filter({ hasText: 'María Prueba' }).locator('.score')).toContainText('0');
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
