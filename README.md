# Pool Paraguay

Aplicación local para administrar jugadores, torneos y un ranking de pool. React, TypeScript y Vite, con interfaz adaptable a celulares y soporte PWA.

La identidad visual usa rojo, blanco y azul, tipografía de cartel deportivo y una interpretación geométrica del ñandutí. Las decisiones y referencias están en [DESIGN.md](./DESIGN.md).

## Ejecutar

Requiere Node.js 22.12 o posterior. Con nvm:

```sh
nvm use
npm ci
npm run dev
```

Abrir la dirección que muestra Vite. Para verificar la versión de producción:

```sh
npm run build
npm run preview
```

## Funcionalidades

- Ranking general y por disciplina (Bola 8, 9 y 10), podio, categorías, búsqueda y movimiento respecto del último torneo.
- Directorio de jugadores con filtro por ciudad. Perfil con posición, victorias, podios, evolución de puntos e historial.
- Enlaces compartibles: cada página, perfil y torneo tiene su dirección (`#/torneos?torneo=…`, `#/?jugador=…`) y botón de compartir.
- Creación, edición y eliminación de jugadores y torneos. Solo se elimina lo que no tiene resultados publicados.
- Publicación de resultados desde la fecha del torneo. Los jugadores y puestos no pueden repetirse; debe existir un primer puesto.
- Reapertura de torneos para corregir resultados. Retira todos los puntos de ese torneo hasta volver a publicarlos.
- Reglas configurables. Cambiar la puntuación no altera resultados históricos; cambiar los mínimos de categoría sí reclasifica a los jugadores.
- Exportación y restauración de respaldos JSON con validación y confirmación antes de reemplazar datos.
- Instalación como PWA y uso sin conexión después de una primera carga de producción.

## Dos modos de datos

| | Local (`npm run build`) | Compartido (`npm run build:remote`) |
|---|---|---|
| Dónde viven los datos | `localStorage` de cada navegador | Base D1 de Cloudflare, una sola para todos |
| Quién edita | Cualquiera que abra la página | Solo quien inicia sesión como administrador |
| Público | Ve datos de ejemplo propios | Ve el ranking real, solo lectura |
| Sin conexión | Funciona completo | Muestra la última copia descargada, sin edición |

### Modo local

Los datos se guardan bajo `pool-paraguay-state-v1`, en este navegador y origen. Se recomienda trabajar en una sola pestaña. Borrar los datos del navegador elimina el registro: exportar respaldos periódicamente. Si el almacenamiento contiene datos inválidos, la aplicación permite exportar el contenido original y bloquea cambios hasta restaurar un respaldo o confirmar el comienzo desde cero.

### Modo compartido

`worker/index.ts` es un Worker de Cloudflare que sirve el sitio y expone `/api`:

- `GET /api/state` es público. Las escrituras (`POST /api/actions`, `PUT /api/state`) exigen sesión de administrador.
- El servidor vuelve a aplicar las reglas de `src/domain.ts`; el navegador nunca decide los puntos. La fecha para publicar resultados se toma en hora del Paraguay.
- Cada guardado lleva la versión que el administrador tenía a la vista. Si otra persona guardó antes, el servidor responde 409 y la aplicación muestra los datos nuevos en vez de pisarlos.
- La sesión es una cookie `HttpOnly; Secure; SameSite=Strict` de 12 horas firmada con una clave derivada de `ADMIN_PASSWORD`: cambiar la contraseña cierra todas las sesiones. Cinco intentos fallidos bloquean esa IP por 15 minutos.
- Cada cambio queda en el registro de auditoría (visible en Configuración), con el motivo cuando se reabre un torneo.

Probarlo en esta máquina:

```sh
cp .dev.vars.example .dev.vars   # y elegir una contraseña de al menos 8 caracteres
npm run dev:remote                # http://localhost:8787, datos en .data/local.sqlite
```

`dev:remote` usa `server.mjs`, que ejecuta el mismo Worker con Node sobre SQLite. Se usa en lugar de `wrangler dev` porque `workerd` requiere glibc 2.32 o posterior y no arranca en sistemas más viejos (por ejemplo Ubuntu 20.04).

Publicarlo en Cloudflare (una sola vez los tres primeros pasos):

```sh
npx wrangler login
npx wrangler d1 create pool-paraguay      # copiar el database_id a wrangler.jsonc
npx wrangler secret put ADMIN_PASSWORD
npm run deploy                            # compila, aplica migraciones y publica
```

Para pasar datos del modo local al compartido: exportar el respaldo en el navegador, iniciar sesión en el sitio publicado y restaurarlo desde Configuración.

## Reglas del ranking

El desempate usa puntos, victorias y nombre, en ese orden. El movimiento compara el ranking actual con el mismo ranking sin los puntos y victorias del último torneo con resultados (fecha y luego identificador). El ranking de una disciplina cuenta solo los puntos ganados en torneos de esa disciplina, sin puntos iniciales, y omite a quienes no la jugaron; la categoría siempre sale del puntaje general.

## Verificación

```sh
npm test                 # dominio, almacenamiento y API del Worker
npm run build
npx playwright install chromium
npm run test:e2e         # modo local, escritorio y móvil
npm run test:e2e:remote  # modo compartido: público, login y publicación
```

Si Playwright no puede descargar su navegador, `PLAYWRIGHT_CHANNEL=chrome` usa el Chrome instalado. Los íconos PNG se generan desde el SVG mediante `node scripts/generate-icons.mjs`.

## Estructura

- `src/domain.ts`: tipos, reglas, ranking y validación. Lo comparten el navegador y el Worker.
- `src/useStore.ts`: una sola interfaz sobre `storage.ts` (local) y `remote.ts` (API).
- `src/useHashRoute.ts`: páginas y diálogos enlazables en el hash.
- `src/pages/`, `src/components/`: una página o pieza de interfaz por archivo. `App.tsx` solo arma cabecera, rutas y diálogos.
- `worker/`, `migrations/`, `wrangler.jsonc`: backend de Cloudflare. `scripts/d1-node.mjs` adapta SQLite a la API de D1 para pruebas y desarrollo.

## Próxima etapa

Una sola contraseña de administrador alcanza para uno o pocos organizadores. Si se suman más, conviene pasar a cuentas individuales para que la auditoría registre quién hizo cada cambio. También quedan pendientes fotos de jugadores y cuadros de eliminación por torneo.
