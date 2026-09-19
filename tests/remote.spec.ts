import { expect, test } from '@playwright/test';

// Modo compartido: compilación `--mode remote` servida por server.mjs con una base SQLite nueva.
test.describe.configure({ mode: 'serial' });

test('el público ve el ranking sin controles de edición', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'El ranking', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Agregar jugador' })).toHaveCount(0);
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Configuración' })).toHaveCount(0);
  await page.goto('/#/configuracion');
  await expect(page.getByRole('heading', { name: 'El ranking', exact: true })).toBeVisible();
});

test('una contraseña incorrecta no abre la sesión', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Acceso de administrador' }).click();
  await page.getByLabel('Contraseña de administrador').fill('incorrecta');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('alert')).toContainText('La contraseña no es correcta');
});

test('el administrador publica y otra persona lo ve sin iniciar sesión', async ({ page, browser }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Acceso de administrador' }).click();
  await page.getByLabel('Contraseña de administrador').fill('clave-e2e-remota');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.getByRole('button', { name: 'Agregar jugador' }).click();
  await page.getByLabel('Nombre y apellido').fill('Remota Prueba');
  await page.getByLabel('Ciudad', { exact: true }).fill('Villarrica');
  await page.getByRole('button', { name: 'Guardar jugador' }).click();
  await expect(page.getByRole('status')).toContainText('Cambios publicados para todos');

  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto('/');
  await expect(visitor.getByRole('link', { name: /Remota Prueba/ })).toBeVisible();
  await expect(visitor.getByRole('button', { name: 'Agregar jugador' })).toHaveCount(0);

  await page.getByRole('navigation').getByRole('link', { name: 'Configuración' }).click();
  await expect(page.getByText('Agregó al jugador Remota Prueba')).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.getByRole('button', { name: 'Agregar jugador' })).toHaveCount(0);
});
