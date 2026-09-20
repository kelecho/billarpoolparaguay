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
- Banner opcional del evento desde «Crear torneo» o «Editar torneo» (JPG, PNG o WebP de hasta 8 MB). No se recorta —sirve un afiche vertical o una imagen apaisada—: se reduce a 1600 px de lado mayor y se guarda como JPEG de hasta unos 300 kB. Se ve completo dentro del torneo y recortado a lo ancho en la tarjeta. Con los resultados publicados el torneo ya no se edita, pero el banner se cambia o se quita desde el propio torneo.
- Exportación y restauración de respaldos JSON con validación y confirmación antes de reemplazar datos.
- Instalación como PWA y uso sin conexión después de una primera carga de producción. En el celular, a quien todavía no la instaló se le ofrece arriba de todo: Android instala de un toque con el diálogo del navegador; iPhone no avisa nunca, así que se abre una guía paso a paso (Safari → Compartir → «Agregar a inicio»). La guía muestra también Android y computadora, para que una persona pueda orientar a otra, y queda siempre a mano en «Instalar la app», al pie. El aviso se puede cerrar y no vuelve a aparecer; ya instalada, desaparecen el aviso y el enlace.

## Dos modos de datos

| | Local (`npm run build`) | Compartido (`npm run build:remote`) |
|---|---|---|
| Dónde viven los datos | `localStorage` de cada navegador | Base D1 de Cloudflare, una sola para todos |
| Quién edita | Cualquiera que abra la página | Solo las cuentas de la organización, según su rol |
| Público | Ve datos de ejemplo propios | Ve el ranking real, solo lectura |
| Sin conexión | Funciona completo | Muestra la última copia descargada, sin edición |
| Actualización | — | Sola: cada 30 s el día de un torneo, cada 5 min el resto del tiempo |

### Modo local

Los datos se guardan bajo `pool-paraguay-state-v1`, en este navegador y origen. Se recomienda trabajar en una sola pestaña. Borrar los datos del navegador elimina el registro: exportar respaldos periódicamente. Si el almacenamiento contiene datos inválidos, la aplicación permite exportar el contenido original y bloquea cambios hasta restaurar un respaldo o confirmar el comienzo desde cero.

### Modo compartido

`worker/index.ts` es un Worker de Cloudflare que sirve el sitio y expone `/api`:

- `GET /api/state` es público. Las escrituras exigen una sesión, y algunas el rol de superadministrador (ver «Cuentas y roles»).
- El servidor vuelve a aplicar las reglas de `src/domain.ts`; el navegador nunca decide los puntos. La fecha para publicar resultados se toma en hora del Paraguay.
- Cada guardado lleva la versión que el administrador tenía a la vista. Si otra persona guardó antes, el servidor responde 409 y la aplicación muestra los datos nuevos en vez de pisarlos.
- La sesión es una cookie `__Host-` con `HttpOnly; Secure; SameSite=Strict` de 12 horas que lleva un token al azar. La tabla `sessions` guarda solo su resumen y a qué cuenta pertenece: cerrar sesión la invalida en el servidor y «Cerrar en todos los dispositivos» borra todas las de esa cuenta. Las escrituras desde otro origen se rechazan.
- El acceso admite cinco intentos fallidos cada 15 minutos por dirección (por prefijo /64 en IPv6) y cien entre todas. El intento se anota en la misma sentencia que lo cuenta, así que los pedidos en paralelo no pasan el límite.
- Cada endpoint lee el cuerpo por partes y corta al pasar su tope: 1 kB el acceso, 100 kB una foto, 256 kB una acción y 10 MB un respaldo.
- El Worker recuerda en memoria el último ranking armado y comprueba la versión en cada pedido: repetir `GET /api/state` cuesta una fila leída, no un recorrido de todas las tablas.
- `public/_headers` define la política de contenido (solo recursos propios, sin scripts ni estilos en línea), `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` y HSTS para el sitio; `server.mjs` aplica el mismo archivo y las pruebas de navegador fallan si la política bloquea algo. Las respuestas de la API llevan `nosniff`, `no-store` y `Cross-Origin-Resource-Policy: same-origin`.
- Cada cambio queda en el registro de auditoría (visible para el superadministrador en Configuración) con el correo de quien lo hizo, y con el motivo cuando se reabre un torneo. Las altas, ediciones y bajas de cuentas también se registran.
- Jugadores, torneos, inscripciones, partidos y resultados tienen cada uno su tabla en D1 (`migrations/0002_tables.sql`, que también reparte el documento de la versión anterior). `worker/store.ts` arma el registro al leer y, al guardar, escribe solo las filas que cambiaron. Cada sentencia lleva sus filas en un parámetro JSON (`json_each`), de modo que un respaldo grande se restaura con un número fijo de consultas. Datos y auditoría se guardan en una transacción que respeta la versión del administrador.
- Las fotos de los jugadores y los banners de los torneos viven en el bucket R2 `PHOTOS`. `POST /api/photos` (con sesión) valida el JPEG según su tipo (`kind: 'banner'` admite más peso que una foto de ficha) y lo guarda con el SHA-256 de su contenido como nombre; la ficha conserva solo la referencia `/api/photos/<hash>.jpg`, que se sirve con caché permanente. El navegador sube cada foto en su propia petición antes de guardar la ficha o restaurar un respaldo; al exportar, vuelve a incluir las fotos en el archivo. Las fotos que quedan sin ficha se borran de R2.
- `GET /api/state?tag=<etiqueta>` responde sin datos cuando el visitante ya tiene la versión vigente: recargar o volver a la pestaña cuesta una fila leída y unos bytes.
- La página usa esa misma consulta para actualizarse sola mientras la pestaña está visible: cada 30 segundos si hay un torneo sin publicar con fecha de hoy o de ayer (`isMatchDay`), para ver el sorteo y los marcadores sin recargar, y cada 5 minutos el resto del tiempo. El fixture muestra «En vivo» mientras se juega. Con un formulario abierto no se actualiza por debajo, así que guardar sobre datos viejos sigue dando conflicto. `VITE_LIVE_POLL_MS` cambia el intervalo al compilar. Como referencia para el plan gratuito de Workers (100.000 pedidos diarios): 100 personas mirando durante 5 horas son unos 60.000 pedidos.

#### Cuentas y roles

Cada persona entra con su correo y su contraseña (`migrations/0004_users.sql`, `worker/auth.ts`). Las contraseñas se guardan derivadas con PBKDF2-SHA256, 100.000 iteraciones —el máximo del runtime de Workers— y una sal por cuenta. Un correo desconocido responde igual y tarda lo mismo que una contraseña errada.

| | Supervisor | Superadministrador |
|---|---|---|
| Jugadores, torneos, inscripciones, fixture, marcadores, publicar y reabrir resultados | Sí | Sí |
| Exportar un respaldo y cambiar su propia contraseña | Sí | Sí |
| Reglas de categorías y puntuación | No | Sí |
| Restaurar un respaldo o empezar desde cero | No | Sí |
| Cuentas: alta, rol, contraseña, desactivar y eliminar | No | Sí |
| Registro de cambios | No | Sí |

El reparto de acciones vive en `src/roles.ts`; el servidor lo hace cumplir y la interfaz solo esconde lo que no corresponde. Nadie puede cambiar su propio rol, desactivarse ni eliminarse, así que siempre queda un superadministrador activo. Cambiar la contraseña o el rol de una cuenta, o desactivarla, cierra sus sesiones abiertas.

El primer superadministrador se crea desde la terminal, con la sesión de wrangler de quien administra Cloudflare. El mismo comando recupera el acceso si alguien olvida su contraseña: repone la clave, reactiva la cuenta y cierra sus sesiones.

```sh
npm run user -- correo@ejemplo.com "Nombre Apellido"                    # superadministrador en producción
npm run user -- correo@ejemplo.com "Nombre Apellido" --role supervisor
npm run user -- correo@ejemplo.com "Nombre Apellido" --local            # base del servidor local
```

Una cuenta creada desde Configuración, o a la que el superadministrador le repone la clave, entra con esa contraseña inicial y no puede hacer nada más hasta elegir una propia; el servidor lo exige, no solo la pantalla.

La contraseña se pide sin mostrarla y nunca viaja como argumento. No hay recuperación por correo: a un supervisor le pone una contraseña nueva el superadministrador desde Configuración.

Probarlo en esta máquina:

```sh
cp .dev.vars.example .dev.vars   # correo y contraseña (12+ caracteres) del superadministrador local
npm run dev:remote                # http://localhost:8787, datos en .data/local.sqlite y fotos en .data/photos
```

`dev:remote` usa `server.mjs`, que ejecuta el mismo Worker con Node sobre SQLite. Se usa en lugar de `wrangler dev` porque `workerd` requiere glibc 2.32 o posterior y no arranca en sistemas más viejos (por ejemplo Ubuntu 20.04).

Con un dominio propio conviene sumar en el panel de Cloudflare una regla de límite de peticiones para `/api/*`; en `workers.dev` no se pueden configurar.

Publicarlo en Cloudflare (una sola vez todo menos `npm run deploy`; R2 se activa antes desde el panel de Cloudflare):

```sh
npx wrangler login
npx wrangler d1 create pool-paraguay      # copiar el database_id a wrangler.jsonc
npx wrangler r2 bucket create pool-paraguay-photos
npm run deploy                            # compila, aplica migraciones y publica
npm run user -- correo@ejemplo.com "Nombre Apellido"   # primer superadministrador
```

Para pasar datos del modo local al compartido: exportar el respaldo en el navegador, iniciar sesión en el sitio publicado y restaurarlo desde Configuración.

## Administrar un torneo

1. En **Torneos → Crear torneo**, elegir categoría, disciplina, fecha, sede, partidas necesarias para ganar cada partido y formato: eliminación directa o doble eliminación.
2. Abrir **Administrar torneo** e inscribir jugadores de esa categoría. Se puede crear una ficha desde el mismo torneo y luego inscribirla.
3. Elegir **Sorteo aleatorio**, **Cabezas de serie por ranking** o **Cabezas de serie en orden manual**. El orden manual se modifica con las flechas de los inscriptos; el cuadro distribuye las cabezas de serie y los pases libres.
4. Realizar el sorteo inicial. Los cruces quedan guardados y se pueden consultar o compartir. Antes del primer resultado, **Volver a sortear** reemplaza los cruces y la programación; **Quitar fixture** permite corregir las inscripciones.
5. Asignar mesa y hora, cargar los marcadores y seguir el avance a la final. Los pases libres avanzan sin cargar un resultado. El ganador debe alcanzar el número de partidas configurado, sin empate.
6. Publicar los resultados del torneo completo para sumar puntos. Para corregir un torneo publicado, reabrirlo con un motivo; se retiran sus puntos pero se conservan los partidos. Si cambia un ganador con resultados posteriores, quitar primero los resultados dependientes, desde la final hacia atrás.

### Formatos

**Doble eliminación con fase final.** Quien pierde en la llave de ganadores sigue en la de perdedores; la segunda derrota elimina. Se juega así hasta que quedan los clasificados que se eligieron al crear el torneo (2, 4, 8, 16 o 32, como máximo la mitad del cuadro): la mitad llega invicta y la otra mitad con una derrota. Ellos definen el torneo por eliminación directa, a partido único y con las mismas partidas para ganar que el resto. Con 2 clasificados es la doble eliminación completa: el invicto y el ganador de perdedores juegan una gran final única, sin revancha.

- Los caídos de ganadores entran a perdedores en orden inverso ronda por medio, y en el primer cruce de la fase final cada invicto enfrenta a un clasificado de la otra mitad del cuadro, no al rival que acaba de mandar a perdedores.
- Los pases libres se propagan solos por la llave de perdedores y se marcan desde el sorteo.
- Puestos: los eliminados en una misma ronda de perdedores comparten puesto, detrás de los clasificados y de quienes caen después (con 16 inscriptos y 8 clasificados: 13.º y 9.º en perdedores; 5.º, 3.º, 2.º y 1.º en la fase final). Con gran final única hay 3.º y 4.º puesto propios. Los puntos salen de la tabla de Configuración según el puesto; más allá del 8.º vale la participación.
- Corregir un marcador de ganadores afecta a las dos llaves: antes hay que quitar los resultados que dependen de él, en cualquiera de las dos.
- El formato y los clasificados quedan fijos cuando se arma el fixture. Hacen falta al menos 3 inscriptos.

El cuadro no se guarda: `src/fixture.ts` lo deduce del tamaño y del formato (`layout`), así un respaldo no puede traer cruces inventados. Las pruebas juegan torneos completos con 3 a 64 inscriptos y todas las fases finales posibles.

**Eliminación directa.** Sin partido por el tercer puesto: ambos semifinalistas eliminados comparten el tercero; los eliminados en cuartos comparten el quinto, y así sucesivamente. Un partido disputado bloquea nuevos sorteos y cambios de inscriptos. En el modo compartido, solo las cuentas con sesión modifican; el público consulta inscritos, cruces, horarios y resultados.

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
- `src/roles.ts`: roles y reparto de acciones, compartido entre navegador y Worker.
- `worker/`, `migrations/`, `wrangler.jsonc`: backend de Cloudflare. `worker/store.ts` lee y escribe las tablas, `worker/auth.ts` lleva sesiones, cuentas y roles, y `scripts/create-user.mjs` crea o recupera cuentas. `scripts/d1-node.mjs` y `scripts/r2-node.mjs` adaptan SQLite y una carpeta a las API de D1 y R2 para pruebas y desarrollo.

## Próxima etapa

Todos los cambios comparten una versión global: si se suman organizadores que trabajan a la vez, conviene pasar a versiones por torneo para que no se crucen al guardar. Los marcadores llegan por consulta periódica; si hiciera falta que aparezcan al instante, el paso siguiente son WebSockets con Durable Objects. Quedan pendientes las reglas de ascenso entre categorías y, si se requieren, otros formatos de torneo como grupos o una gran final con revancha.
