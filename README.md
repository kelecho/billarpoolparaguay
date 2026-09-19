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

- Ranking con categorías, búsqueda por nombre, ciudad o club y movimiento respecto del último torneo publicado.
- Registro y edición de jugadores, puntos iniciales y perfil con historial.
- Creación y edición de torneos de Bola 8, Bola 9 y Bola 10.
- Publicación de resultados desde la fecha del torneo. Los jugadores y puestos no pueden repetirse; debe existir un primer puesto.
- Reapertura de torneos para corregir resultados. Retira todos los puntos de ese torneo hasta volver a publicarlos.
- Reglas configurables. Cambiar la puntuación no altera resultados históricos; cambiar los mínimos de categoría sí reclasifica a los jugadores.
- Exportación y restauración de respaldos JSON con validación y confirmación antes de reemplazar datos.
- Datos de demostración identificados. En Configuración se puede comenzar con un registro vacío.
- Instalación como PWA y uso sin conexión después de una primera carga de producción.

## Datos y alcance

Los datos se guardan en `localStorage` bajo `pool-paraguay-state-v1`, en este navegador y origen. No hay servidor de datos, sincronización entre dispositivos, cuentas ni acceso de administrador. Se recomienda trabajar en una sola pestaña; no hay coordinación de ediciones simultáneas. Borrar los datos del navegador elimina el registro local: exportar respaldos periódicamente.

Si el almacenamiento contiene datos inválidos, la aplicación permite exportar el contenido original y bloquea cambios hasta restaurar un respaldo o confirmar el comienzo desde cero. Los errores de almacenamiento no se anuncian como guardados exitosos.

El desempate usa puntos, victorias y nombre, en ese orden. El movimiento compara el ranking actual con el mismo ranking sin los puntos y victorias del último torneo con resultados (fecha y luego identificador). Las fechas se interpretan según la fecha local del dispositivo. El motivo de reapertura se valida, pero esta versión no mantiene un registro de auditoría.

## Verificación

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Las pruebas de navegador cubren escritorio y móvil sobre la compilación de producción. Los íconos PNG se generan desde el SVG existente mediante `node scripts/generate-icons.mjs`.

## Próxima etapa

Persistencia compartida, autenticación de administradores y auditoría de correcciones antes de habilitar edición pública. Se retiraron los comandos incompletos de Cloudflare: todavía no existen un Worker, migraciones D1 ni configuración de despliegue.

Los archivos `domain.js`, `sw.js`, `manifest.webmanifest` e `icon.svg` en la raíz pertenecen al prototipo anterior y se conservan como referencia. La aplicación usa `src/domain.ts`, `public/` y el service worker generado por Vite. `server.mjs` sirve la compilación actual usando Vite Preview.
