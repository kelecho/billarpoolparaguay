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

- Ranking por categoría y disciplina (Bola 8, 9 y 10), con puestos desde 1, podio, búsqueda y movimiento respecto del último torneo. También se puede consultar el general.
- Directorio de jugadores con filtro por ciudad. Perfil con posición, victorias, podios, evolución de puntos e historial.
- Insignias de categoría con escudos tricolores: Primera, Segunda, Tercera y Principiante. Se actualizan con la categoría del jugador y también aparecen en los filtros y el ranking.
- Foto opcional desde «Editar jugador»: cargar, reemplazar o quitar JPG, PNG o WebP de hasta 8 MB y 24 megapíxeles. Se recorta al centro y se guarda como JPEG de hasta 384 × 384 px; los respaldos incluyen las fotos.
- Enlaces compartibles: cada página, perfil y torneo tiene su dirección (`#/torneos?torneo=…`, `#/?jugador=…`) y botón de compartir.
- Creación, edición y eliminación de jugadores y torneos por categoría. Las inscripciones y los partidos disputados se protegen antes de permitir una baja.
- Inscripciones de 2 a 128 jugadores de la categoría del torneo, sorteo inicial aleatorio, cabezas de serie por ranking u orden manual, pases libres y fixture de eliminación directa.
- Mesas y horarios por partido, marcadores al número de partidas definido, avance automático del ganador y publicación de la clasificación al completar la final. Los eliminados en la misma ronda comparten puesto y puntos.
- Publicación de resultados desde la fecha del torneo. Los torneos históricos sin categoría conservan la carga manual de resultados.
- Reapertura de torneos para corregir resultados. Retira todos los puntos de ese torneo hasta volver a publicarlos.
- Categoría asignada al jugador: sumar puntos no genera ascensos. Los registros anteriores conservan su categoría al migrar. Cambiar la puntuación no altera resultados históricos; las reglas de traspaso quedan pendientes.
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
- Jugadores, torneos, inscripciones, partidos y resultados tienen cada uno su tabla en D1 (`migrations/0002_tables.sql`, que también reparte el documento de la versión anterior). `worker/store.ts` arma el registro al leer y, al guardar, escribe solo las filas que cambiaron. Cada sentencia lleva sus filas en un parámetro JSON (`json_each`), de modo que un respaldo grande se restaura con un número fijo de consultas. Datos y auditoría se guardan en una transacción que respeta la versión del administrador.
- Las fotos viven en el bucket R2 `PHOTOS`. `POST /api/photos` (administrador) valida el JPEG y lo guarda con el SHA-256 de su contenido como nombre; la ficha conserva solo la referencia `/api/photos/<hash>.jpg`, que se sirve con caché permanente. El navegador sube cada foto en su propia petición antes de guardar la ficha o restaurar un respaldo; al exportar, vuelve a incluir las fotos en el archivo. Las fotos que quedan sin ficha se borran de R2.
- `GET /api/state?tag=<etiqueta>` responde sin datos cuando el visitante ya tiene la versión vigente: recargar o volver a la pestaña cuesta una fila leída y unos bytes.

Probarlo en esta máquina:

```sh
cp .dev.vars.example .dev.vars   # y elegir una contraseña de al menos 8 caracteres
npm run dev:remote                # http://localhost:8787, datos en .data/local.sqlite y fotos en .data/photos
```

`dev:remote` usa `server.mjs`, que ejecuta el mismo Worker con Node sobre SQLite. Se usa en lugar de `wrangler dev` porque `workerd` requiere glibc 2.32 o posterior y no arranca en sistemas más viejos (por ejemplo Ubuntu 20.04).

Publicarlo en Cloudflare (una sola vez los cuatro primeros pasos; R2 se activa antes desde el panel de Cloudflare):

```sh
npx wrangler login
npx wrangler d1 create pool-paraguay      # copiar el database_id a wrangler.jsonc
npx wrangler r2 bucket create pool-paraguay-photos
npx wrangler secret put ADMIN_PASSWORD
npm run deploy                            # compila, aplica migraciones y publica
```

Para pasar datos del modo local al compartido: exportar el respaldo en el navegador, iniciar sesión en el sitio publicado y restaurarlo desde Configuración.

## Administrar un torneo

1. En **Torneos → Crear torneo**, elegir categoría, disciplina, fecha, sede y partidas necesarias para ganar cada partido.
2. Abrir **Administrar torneo** e inscribir jugadores de esa categoría. Se puede crear una ficha desde el mismo torneo y luego inscribirla.
3. Elegir **Sorteo aleatorio**, **Cabezas de serie por ranking** o **Cabezas de serie en orden manual**. El orden manual se modifica con las flechas de los inscriptos; el cuadro distribuye las cabezas de serie y los pases libres.
4. Realizar el sorteo inicial. Los cruces quedan guardados y se pueden consultar o compartir. Antes del primer resultado, **Volver a sortear** reemplaza los cruces y la programación; **Quitar fixture** permite corregir las inscripciones.
5. Asignar mesa y hora, cargar los marcadores y seguir el avance a la final. Los pases libres avanzan sin cargar un resultado. El ganador debe alcanzar el número de partidas configurado, sin empate.
6. Publicar los resultados del torneo completo para sumar puntos. Para corregir un torneo publicado, reabrirlo con un motivo; se retiran sus puntos pero se conservan los partidos. Si cambia un ganador con resultados posteriores, quitar primero los resultados dependientes, desde la final hacia atrás.

El formato inicial es eliminación directa, sin partido por el tercer puesto: ambos semifinalistas eliminados comparten el tercero; los eliminados en cuartos comparten el quinto, y así sucesivamente. Un partido disputado bloquea nuevos sorteos y cambios de inscriptos. En el modo compartido, solo el administrador modifica; el público consulta inscritos, cruces, horarios y resultados.

## Reglas del ranking

Cada jugador tiene una categoría fija asignada y cada categoría tiene su clasificación desde el puesto 1. El perfil y el directorio muestran su posición dentro de esa categoría. Sumar puntos no provoca ascensos; el traspaso entre categorías queda pendiente. Un jugador inscripto o con resultados no puede cambiarse de categoría desde la edición de su ficha.

El desempate usa puntos, victorias de torneo y nombre, en ese orden. El movimiento compara la clasificación seleccionada con la misma sin los puntos y victorias del último torneo con participación de esa categoría (fecha y luego identificador). El ranking de una disciplina cuenta solo los puntos ganados en sus torneos, sin puntos iniciales, y omite a quienes no la jugaron.

Los respaldos anteriores sin categoría asignada se adaptan usando la categoría que tenían al cargarlos por primera vez. Desde ese momento se conserva al guardar, sin recalcularla cuando se publican resultados. Renombrar una categoría actualiza sus asociaciones con jugadores y torneos.

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
- `src/fixture.ts` y `src/tournamentActions.ts`: sorteo, cuadros, validación de partidos, inscripciones y publicación de puntos.
- `src/useStore.ts`: una sola interfaz sobre `storage.ts` (local) y `remote.ts` (API).
- `src/useHashRoute.ts`: páginas y diálogos enlazables en el hash.
- `src/pages/`, `src/components/`: una página o pieza de interfaz por archivo. `App.tsx` solo arma cabecera, rutas y diálogos.
- `worker/`, `migrations/`, `wrangler.jsonc`: backend de Cloudflare. `worker/store.ts` lee y escribe las tablas. `scripts/d1-node.mjs` y `scripts/r2-node.mjs` adaptan SQLite y una carpeta a las API de D1 y R2 para pruebas y desarrollo.

## Próxima etapa

Una sola contraseña de administrador alcanza para uno o pocos organizadores. Si se suman más, conviene pasar a cuentas individuales para que la auditoría registre quién hizo cada cambio, y a versiones por torneo para que dos organizadores no se crucen al guardar. El público ve los cambios al recargar o volver a la pestaña; seguir partidos en directo requiere actualizaciones automáticas. Quedan pendientes las reglas de ascenso entre categorías y, si se requieren, otros formatos de torneo como doble eliminación o grupos.
