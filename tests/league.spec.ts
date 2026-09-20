import { expect, test } from '@playwright/test';

for (const legs of [1, 2]) test(`liga de ${legs} vuelta(s): jornadas, descansos, fechas, tabla y puntos finales`, async ({ page }) => {
  await page.goto('/#/torneos');
  await page.getByRole('button', { name: 'Crear torneo' }).click();
  await page.getByLabel('Nombre del torneo').fill('Liga de prueba');
  await page.getByLabel('Fecha', { exact: true }).fill('2025-03-01');
  await page.getByLabel('Categoría del torneo').selectOption('Segunda');
  await page.getByLabel('Partidas para ganar').fill('2');
  await page.getByLabel('Formato').selectOption('league');
  await page.getByLabel('Vueltas de la liga').selectOption(String(legs));
  await expect(page.getByLabel(/Partido por el tercer puesto/)).toHaveCount(0);
  await page.getByLabel('Sede y ciudad').fill('Club de la liga');
  await page.getByRole('button', { name: 'Guardar torneo' }).click();
  const card = page.getByRole('article').filter({ hasText: 'Liga de prueba' });
  await expect(card).toContainText('Liga · Bola 9');
  await card.getByRole('link', { name: 'Administrar torneo' }).click();
  const dialog = page.getByRole('dialog');
  for (const name of ['Alejandro Vera', 'Carlos Acosta', 'Santiago Rojas']) {
    await dialog.getByRole('button', { name: `Inscribir a ${name}`, exact: true }).click();
    await expect(dialog.getByRole('button', { name: `Quitar inscripción de ${name}`, exact: true })).toBeVisible();
  }
  await dialog.getByLabel('Armado de cruces').selectOption('manual');
  await dialog.getByRole('button', { name: 'Generar jornadas' }).click();
  const table = dialog.getByRole('table', { name: 'Clasificación de la liga' });
  await expect(table.locator('tbody tr')).toHaveCount(3);
  await expect(dialog.locator('.league-rest')).toContainText('Alejandro Vera');
  await expect(dialog.getByRole('button', { name: 'Publicar resultados del torneo' })).toBeDisabled();
  await expect(dialog.getByRole('combobox', { name: 'Jornada', exact: true }).locator('option')).toHaveCount(3 * legs);

  let match = dialog.getByRole('article').first();
  await match.getByRole('button', { name: 'Fecha, mesa y horario' }).click();
  await match.getByLabel('Fecha del partido').fill('2099-03-02');
  await match.getByLabel('Mesa', { exact: true }).fill('2');
  await match.getByLabel('Hora del partido').fill('19:30');
  await match.getByRole('button', { name: 'Guardar programación' }).click();
  await expect(match.getByRole('button', { name: 'Cargar resultado' })).toBeDisabled();
  await match.getByRole('button', { name: 'Fecha, mesa y horario' }).click();
  await match.getByLabel('Fecha del partido').fill('2025-03-02');
  await match.getByRole('button', { name: 'Guardar programación' }).click();
  await page.reload();
  await expect(dialog).toContainText('Mesa 2 · 19:30 h');
  for (let round = 0; round < 3 * legs; round++) {
    await dialog.getByRole('combobox', { name: 'Jornada', exact: true }).selectOption(String(round));
    match = dialog.getByRole('article').first();
    await expect(dialog.getByRole('article')).toHaveCount(1);
    await match.getByRole('button', { name: 'Cargar resultado' }).click();
    const scores = match.getByRole('spinbutton');
    const a = (await scores.nth(0).getAttribute('aria-label'))!;
    const b = (await scores.nth(1).getAttribute('aria-label'))!;
    const aWins = a.localeCompare(b) < 0;
    await scores.nth(0).fill(aWins ? '2' : '0');
    await scores.nth(1).fill(aWins ? '0' : '2');
    await match.getByRole('button', { name: 'Guardar resultado' }).click();
    await expect(match.getByRole('button', { name: 'Editar resultado' })).toBeVisible();
  }
  await expect(table.locator('tbody tr').first()).toContainText('Alejandro Vera');
  await expect(table.locator('tbody tr').first().locator('td').last()).toHaveText(String(6 * legs));
  await expect(dialog.locator('.fixture-champion')).toContainText('Alejandro Vera');
  await expect(dialog).toContainText(`${3 * legs}/${3 * legs} partidos disputados`);
  await dialog.locator('.league-board').screenshot({ path: test.info().outputPath('liga.png') });
  expect(await dialog.evaluate(d => d.scrollWidth <= d.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => document.documentElement.dataset.theme = 'dark');
  await dialog.locator('.league-board').screenshot({ path: test.info().outputPath('liga-oscura.png') });
  await dialog.getByRole('button', { name: 'Publicar resultados del torneo' }).click();
  await expect(dialog.getByRole('heading', { name: 'Clasificación final' })).toBeVisible();
  await expect(dialog.locator('.result-list li')).toHaveCount(3);
  await expect(dialog.locator('.result-list li').first()).toContainText('Alejandro Vera');
  await expect(dialog.locator('.result-list li').first()).toContainText('+300');
  await page.reload();
  await expect(dialog.getByRole('heading', { name: 'Clasificación final' })).toBeVisible();
  await expect(table.locator('tbody tr').first().locator('td').last()).toHaveText(String(6 * legs));
});
