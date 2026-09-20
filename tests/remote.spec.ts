import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// Modo compartido: compilación `--mode remote` servida por server.mjs con una base SQLite nueva.
test.describe.configure({ mode: 'serial' });

// La política de contenido real no debe bloquear nada de la aplicación: fotos, fuentes, estilos ni el service worker.
let blocked: string[] = [];
test.beforeEach(async ({ context }) => {
  blocked = [];
  context.on('console', message => { if (/Content Security Policy|Refused to/i.test(message.text())) blocked.push(message.text()); });
});
test.afterEach(() => expect(blocked).toEqual([]));

const ADMIN = { email: 'admin@pool.test', password: 'clave-e2e-remota' };
async function signIn(page: Page, { email, password }: { email: string; password: string }) {
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
}

test('el público ve el ranking sin controles de edición', async ({ page }) => {
  const response = await page.goto('/');
  expect(response!.headers()['content-security-policy']).toContain("script-src 'self'");
  expect(response!.headers()['x-frame-options']).toBe('DENY');
  await expect(page.locator('html')).toHaveAttribute('data-theme', /light|dark/);
  await expect(page.getByRole('heading', { name: 'El ranking', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Agregar jugador' })).toHaveCount(0);
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Configuración' })).toHaveCount(0);
  await page.goto('/#/configuracion');
  await expect(page.getByRole('heading', { name: 'El ranking', exact: true })).toBeVisible();
});

test('una contraseña incorrecta no abre la sesión', async ({ page }) => {
  await page.goto('/');
  await signIn(page, { ...ADMIN, password: 'incorrecta-123' });
  await expect(page.getByRole('alert')).toContainText('El correo o la contraseña no son correctos');
});

test('el administrador publica y otra persona lo ve sin iniciar sesión', async ({ page, browser }) => {
  await page.goto('/');
  await signIn(page, ADMIN);
  await page.getByRole('button', { name: 'Agregar jugador' }).click();
  await page.getByLabel('Nombre y apellido').fill('Remota Prueba');
  await page.getByLabel('Ciudad', { exact: true }).fill('Villarrica');
  await page.getByLabel('Foto del jugador (opcional)').setInputFiles('public/icon-512.png');
  await expect(page.getByRole('dialog').getByRole('img', { name: 'Foto de Remota Prueba' })).toBeVisible();
  await page.getByRole('button', { name: 'Guardar jugador' }).click();
  await expect(page.getByRole('status')).toContainText('Cambios publicados para todos');

  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto('/');
  await visitor.getByRole('button', { name: 'Principiante', exact: true }).click();
  await expect(visitor.getByRole('link', { name: /Remota Prueba/ })).toBeVisible();
  await expect(visitor.getByRole('button', { name: 'Agregar jugador' })).toHaveCount(0);
  await visitor.getByRole('link', { name: /Remota Prueba/ }).click();
  await expect(visitor.getByRole('dialog').getByRole('img', { name: 'Foto de Remota Prueba' })).toBeVisible();
  // La ficha trae solo la dirección del archivo; la imagen se pide aparte y el navegador la guarda en caché.
  await expect(visitor.getByRole('dialog').getByRole('img', { name: 'Foto de Remota Prueba' })).toHaveAttribute('src', /^\/api\/photos\/[0-9a-f]{64}\.jpg$/);
  await expect(visitor.getByRole('dialog').getByRole('button', { name: 'Editar jugador' })).toHaveCount(0);
  await visitor.context().close();

  await page.getByRole('navigation').getByRole('link', { name: 'Configuración' }).click();
  await expect(page.getByText('Agregó al jugador Remota Prueba')).toBeVisible();
  await expect(page.locator('.audit-list').getByText(ADMIN.email).first()).toBeVisible();

  // El respaldo lleva la foto adentro y restaurarlo la vuelve a subir.
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar respaldo' }).click();
  const backup = await (await downloaded).path();
  expect(JSON.parse(readFileSync(backup, 'utf8')).players[0].photo).toMatch(/^data:image\/jpeg;base64,/);
  await page.getByLabel('Archivo de respaldo').setInputFiles(backup);
  await page.getByRole('button', { name: 'Confirmar reemplazo' }).click();
  await expect(page.getByRole('status')).toContainText('Cambios publicados para todos');
  await page.getByRole('navigation').getByRole('link', { name: 'Jugadores' }).click();
  await expect(page.getByRole('img', { name: 'Foto de Remota Prueba' })).toHaveAttribute('src', /^\/api\/photos\//);
  await expect(page.getByRole('img', { name: 'Foto de Remota Prueba' })).toHaveJSProperty('complete', true);
  await page.getByRole('navigation').getByRole('link', { name: 'Configuración' }).click();
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.getByRole('button', { name: 'Agregar jugador' })).toHaveCount(0);
});

test('el administrador sortea y publica un torneo y el visitante consulta el fixture', async ({ page, browser }) => {
  await page.goto('/');
  await signIn(page, ADMIN);
  await page.getByRole('navigation').getByRole('link', { name: 'Torneos', exact: true }).click();
  await page.getByRole('button', { name: 'Crear torneo' }).click();
  await page.getByLabel('Nombre del torneo').fill('Copa remota');
  await page.getByLabel('Fecha', { exact: true }).fill('2025-01-01');
  await page.getByLabel('Categoría del torneo').selectOption('Principiante');
  await page.getByLabel('Partidas para ganar').fill('2');
  await page.getByLabel('Sede y ciudad').fill('Club remoto');
  await page.getByRole('button', { name: 'Guardar torneo' }).click();
  await page.getByRole('article').filter({ hasText: 'Copa remota' }).getByRole('link', { name: 'Administrar torneo' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Crear jugador', exact: true }).click();
  await expect(page.getByLabel('Categoría del jugador')).toHaveValue('Principiante');
  await page.getByLabel('Nombre y apellido').fill('Rival remoto');
  await page.getByLabel('Ciudad', { exact: true }).fill('Asunción');
  await page.getByRole('button', { name: 'Guardar jugador' }).click();
  for (const name of ['Remota Prueba', 'Rival remoto']) {
    await dialog.getByRole('button', { name: `Inscribir a ${name}`, exact: true }).click();
    await expect(dialog.getByRole('button', { name: `Quitar inscripción de ${name}`, exact: true })).toBeVisible();
  }
  await dialog.getByRole('button', { name: 'Realizar sorteo inicial' }).click();
  await expect(dialog.getByRole('article', { name: 'Partido 1-1', exact: true })).toBeVisible();
  const context = await browser.newContext();
  const visitor = await context.newPage();
  await visitor.goto(page.url());
  await expect(visitor.getByRole('dialog').getByRole('article', { name: 'Partido 1-1', exact: true })).toBeVisible();
  await expect(visitor.getByRole('button', { name: 'Cargar resultado', exact: true })).toHaveCount(0);
  await expect(visitor.getByRole('button', { name: 'Volver a sortear' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Cargar resultado', exact: true }).click();
  await dialog.getByRole('spinbutton').nth(0).fill('2');
  await dialog.getByRole('spinbutton').nth(1).fill('0');
  await dialog.getByRole('button', { name: 'Guardar resultado' }).click();
  await expect(dialog.getByRole('button', { name: 'Publicar resultados del torneo' })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Publicar resultados del torneo' }).click();
  await expect(dialog.getByRole('heading', { name: 'Clasificación final' })).toBeVisible();
  await visitor.reload();
  await expect(visitor.getByRole('heading', { name: 'Clasificación final' })).toBeVisible();
  await expect(visitor.getByRole('dialog')).toContainText('+300');
  await context.close();
});

test('el superadministrador crea una supervisora, que entra con permisos limitados y cambia su contraseña', async ({ page, browser }) => {
  await page.goto('/');
  await signIn(page, ADMIN);
  await expect(page.getByText('Superadministrador local · Superadministrador')).toBeVisible();
  await page.getByRole('navigation').getByRole('link', { name: 'Configuración' }).click();
  await page.getByRole('button', { name: 'Agregar cuenta' }).click();
  await page.getByLabel('Nombre y apellido').fill('Susana Supervisora');
  await page.getByLabel('Correo').fill('susana@pool.test');
  await expect(page.getByLabel('Rol')).toHaveValue('supervisor');
  await page.getByLabel('Contraseña inicial').fill('clave-inicial-susana');
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.locator('.account-list')).toContainText('susana@pool.test');
  await expect(page.getByText('Creó la cuenta de Susana Supervisora (Supervisor)')).toBeVisible();

  const context = await browser.newContext();
  const susana = await context.newPage();
  await susana.goto('/');
  await signIn(susana, { email: 'susana@pool.test', password: 'clave-inicial-susana' });
  await expect(susana.getByText('Susana Supervisora · Supervisor')).toBeVisible();
  // La contraseña se la puso otra persona: antes de cargar nada tiene que elegir la suya.
  const first = susana.getByRole('dialog', { name: 'Elegí tu contraseña' });
  await expect(susana.getByRole('button', { name: 'Agregar jugador' })).toHaveCount(0);
  await first.getByLabel('Contraseña inicial').fill('clave-inicial-susana');
  await first.getByLabel('Contraseña nueva', { exact: true }).fill('clave-propia-de-susana');
  await first.getByLabel('Repetir contraseña nueva').fill('clave-propia-de-susana');
  await first.getByRole('button', { name: 'Cambiar contraseña' }).click();
  await expect(susana.getByRole('status')).toContainText('Contraseña cambiada. Ya podés cargar resultados.');
  await expect(susana.getByRole('button', { name: 'Agregar jugador' })).toBeVisible();
  await susana.getByRole('navigation').getByRole('link', { name: 'Configuración' }).click();
  await expect(susana.getByRole('heading', { name: 'Mi cuenta' })).toBeVisible();
  for (const name of ['Cuentas', 'Registro de cambios', 'Nuevo registro']) await expect(susana.getByRole('heading', { name })).toHaveCount(0);
  await expect(susana.getByRole('button', { name: 'Restaurar respaldo' })).toHaveCount(0);
  await expect(susana.getByRole('button', { name: 'Guardar reglas' })).toHaveCount(0);

  // Al desactivarla, su sesión deja de valer en el servidor aunque la pestaña siga abierta.
  await page.getByRole('button', { name: 'Editar a Susana Supervisora' }).click();
  await page.getByLabel('Cuenta activa').uncheck();
  await page.getByRole('button', { name: 'Guardar cuenta' }).click();
  await expect(page.locator('.account-list')).toContainText('inactiva');
  await susana.reload();
  await expect(susana.getByRole('button', { name: 'Iniciar sesión' })).toBeVisible();
  await signIn(susana, { email: 'susana@pool.test', password: 'clave-propia-de-susana' });
  await expect(susana.getByRole('alert')).toContainText('El correo o la contraseña no son correctos');
  await context.close();
});

test('el visitante ve el marcador de un torneo en juego sin recargar la página', async ({ page, browser }) => {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const date = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
  await page.goto('/');
  await signIn(page, ADMIN);
  await page.getByRole('navigation').getByRole('link', { name: 'Torneos', exact: true }).click();
  await page.getByRole('button', { name: 'Crear torneo' }).click();
  await page.getByLabel('Nombre del torneo').fill('Copa en vivo');
  await page.getByLabel('Fecha', { exact: true }).fill(date);
  await page.getByLabel('Categoría del torneo').selectOption('Principiante');
  await page.getByLabel('Partidas para ganar').fill('2');
  await page.getByLabel('Sede y ciudad').fill('Club en vivo');
  await page.getByRole('button', { name: 'Guardar torneo' }).click();
  await page.getByRole('article').filter({ hasText: 'Copa en vivo' }).getByRole('link', { name: 'Administrar torneo' }).click();
  const dialog = page.getByRole('dialog');
  for (const name of ['Remota Prueba', 'Rival remoto']) {
    await dialog.getByRole('button', { name: `Inscribir a ${name}`, exact: true }).click();
    await expect(dialog.getByRole('button', { name: `Quitar inscripción de ${name}`, exact: true })).toBeVisible();
  }

  // El visitante abre el torneo antes del sorteo y no vuelve a tocar la página.
  const context = await browser.newContext();
  const visitor = await context.newPage();
  await visitor.goto(page.url());
  await expect(visitor.getByRole('dialog')).toContainText('El fixture estará disponible después del sorteo inicial.');

  await dialog.getByRole('button', { name: 'Realizar sorteo inicial' }).click();
  await expect(visitor.getByRole('dialog').getByRole('article', { name: 'Partido 1-1', exact: true })).toBeVisible();
  await expect(visitor.getByRole('dialog')).toContainText('En vivo');
  await expect(visitor.getByRole('dialog')).toContainText('0/1 partidos disputados · Los marcadores se actualizan solos');

  await dialog.getByRole('button', { name: 'Cargar resultado', exact: true }).click();
  await dialog.getByRole('spinbutton').nth(0).fill('2');
  await dialog.getByRole('spinbutton').nth(1).fill('1');
  await dialog.getByRole('button', { name: 'Guardar resultado' }).click();
  await expect(visitor.getByRole('dialog')).toContainText('1/1 partidos disputados');

  // Con un formulario abierto la página no se actualiza por debajo: guardar sobre datos viejos sigue dando conflicto.
  await dialog.getByRole('button', { name: 'Editar torneo' }).click();
  await page.getByLabel('Nombre del torneo').fill('Copa en vivo (editada)');
  const { version, state } = await (await page.request.get('/api/state')).json();
  const tournamentId = state.tournaments.find((t: { name: string }) => t.name === 'Copa en vivo').id;
  const other = await page.request.post('/api/actions', { data: { action: { type: 'match.schedule', tournamentId, matchId: '1-1', table: 'Mesa 9', time: '' }, version } });
  expect(other.status()).toBe(200);
  await expect(visitor.getByRole('dialog')).toContainText('Mesa 9');
  await page.waitForTimeout(2500);
  await page.getByRole('button', { name: 'Guardar torneo' }).click();
  await expect(page.getByRole('alert')).toContainText('Otra persona guardó cambios mientras editabas');
  await page.getByRole('button', { name: 'Guardar torneo' }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Copa en vivo (editada)' })).toBeVisible();

  await page.getByRole('dialog').getByRole('button', { name: 'Publicar resultados del torneo' }).click();
  await expect(visitor.getByRole('heading', { name: 'Clasificación final' })).toBeVisible();
  await expect(visitor.getByRole('dialog')).not.toContainText('En vivo');
  await context.close();
});
