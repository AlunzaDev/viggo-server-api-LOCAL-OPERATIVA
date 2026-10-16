# Viggo Server API — OPERATIVO

Backend operativo instalado en cada estacionamiento. Su prioridad es mantener funcionando entradas, salidas, caja, pensiones y dispositivos aunque la conexión con la nube no esté disponible.

## Frontera con ADMINISTRATIVO

`ADMINISTRATIVO` es la autoridad sobre:

- Registro, validación y recuperación de cuentas.
- CRUD de usuarios, roles y perfiles de permisos.
- Alta y configuración comercial de parkings.
- Alta y configuración de módulos.
- Planes de pensión y contratos Pension Pass.
- Stripe, pagos móviles y proveedores.

`OPERATIVO` conserva proyecciones locales de usuarios, parkings, módulos, planes y contratos porque las necesita para operar sin conexión. Esas proyecciones se consultan localmente, pero ya no se administran mediante esta API.

## Responsabilidades operativas

- Login local de usuarios previamente sincronizados.
- Tickets de entrada, cobro, salida e historial.
- POS y cobro en efectivo.
- Turnos, movimientos, conteos y cortes de caja.
- Pension Pass: validación, antipassback y apertura de barrera.
- Movimientos de pensionados.
- Vinculación, autorización y runtime de dispositivos.
- Socket.IO para entradas, salidas, POS, expendedoras y barreras.

## Administración retirada

Esta versión ya no contiene:

- Registro de usuarios ni envío de correos.
- Recuperación o validación de cuentas.
- CRUD de usuarios y perfiles de permisos.
- CRUD local de parkings.
- CRUD local de planes de pensión.
- Contratación, renovación o edición de Pension Pass.
- CRUD administrativo de módulos.
- Stripe y proveedores.
- Alias duplicados `/api/pos-register` y `/api/pos-payments`.

La aprobación, rechazo, reapertura y reinicio del **binding físico de dispositivos** sí permanecen en OPERATIVO porque forman parte del runtime del estacionamiento.

## Rutas expuestas

### Estado

- `GET /api/ping`
- `GET /api/health`

### Autenticación local

- `POST /api/auth/login-correo`
- `POST /api/auth/login-telefono`
- `POST /api/auth/renew`
- `GET /api/auth/renew/:id` — alias temporal, requiere token válido y no confía en el ID recibido.

### Proyecciones de solo lectura

- `GET /api/proyectos`
- `GET /api/proyectos/:id`
- `GET /api/modulos`
- `GET /api/modulos/proyecto/:proyectoId`
- `GET /api/modulos/identificador/:identificador`
- `GET /api/modulos/:id`
- `GET /api/pensiones`
- `GET /api/pensiones/proyecto/:proyectoId`
- `GET /api/pensiones/:id`

### Runtime de dispositivos

- `GET /api/modulos/pending-device-bindings`
- `PATCH /api/modulos/:id/device-binding/reset`
- `PATCH /api/modulos/:id/device-binding/approve`
- `PATCH /api/modulos/:id/device-binding/reject`
- `PATCH /api/modulos/:id/device-binding/pending`

### Operación

- `/api/tickets`
- `/api/pension-pass`
- `/api/pension-moves`
- `/api/cash-register`
- `/api/payments`
- `/api/cash-payments`

## Preparación local

```powershell
Copy-Item .env.example .env.dev      # ajustar DATABASE_URL y secretos
docker compose up -d postgres        # Postgres 17 en 127.0.0.1:5435
npm install
npm run db:migrate:deploy            # aplica las migraciones
npm run db:seed                      # estacionamiento demo vinculado (opcional)
npm run dev
```

El modo de desarrollo genera el cliente de Prisma, compila a `dist`, vigila cambios de TypeScript y reinicia Node automáticamente.

El seed carga "Demo Centro" (código 0001) pasando por el mismo sync que usa ADMINISTRATIVO, crea `admin@viggo.local` y `cajero@viggo.local` (contraseñas de `SEED_ADMIN_PASSWORD` / `SEED_USER_PASSWORD`, o generadas) y vincula la instalación. Se puede correr varias veces.

### Base de datos y pruebas

- `npm run db:migrate` crea una migración nueva en desarrollo; `npm run db:migrate:deploy` aplica las pendientes.
- `npm run db:studio` abre Prisma Studio.
- `npm test` corre las pruebas contra `viggo_operativo_test` (copiar `.env.test.example` a `.env.test`).
- `npm run check` genera el cliente y revisa tipos de la app y de las pruebas.
- `pg` va fijado en 8.x (versión exacta en `package.json`). Dentro de una transacción, Prisma 7 lanza en paralelo las consultas de un `include` con varias relaciones sobre la misma conexión; `pg@8` las encola con un aviso y `pg@9` las rechazará. Por eso, dentro de una transacción (o en una escritura anidada) no se usa `include` con varias relaciones: se escribe primero y se lee después, o se cargan las relaciones una por una. Los tests fallan si aparece el aviso. `relationLoadStrategy: "join"` lo resolvería, pero en Prisma 7.10 sigue siendo preview (`relationJoins`); revisar al subir a Prisma 8 antes de pasar a `pg@9`.

## Docker

Ver [docker-runbook.md](docker-runbook.md). Postgres sólo se publica en `127.0.0.1:5435` para no exponerlo a la red del estacionamiento.

## Variables principales

- `DATABASE_URL`
- `DATABASE_POOL_MAX`
- `JWT_SEED`
- `CORS_ALLOWED_ORIGINS`
- `PAYMENT_CURRENCY`
- `PROJECT_ID` (sólo con `APP_ENV=dev` o `test`: vincula sin credenciales de la nube, así que no hay login en línea, sincronización ni envío de eventos; en otros ambientes se ignora y hay que vincular con el token del proyecto)
- `SYNC_SERVICE_TOKEN` (sólo autentica las llamadas ADMINISTRATIVO → OPERATIVO; hacia la nube se usa el token propio que la instalación recibe al ser aprobada)
- `BARRIER_SOCKET_REQUIRED`
- `BARRIER_SOCKET_TIMEOUT_MS`

No deben agregarse credenciales de Stripe ni correo a OPERATIVO.

## Sincronización

Los modelos locales de usuarios, parkings, módulos, pensiones y Pension Pass son copias de ADMINISTRATIVO necesarias para operar sin internet. El sync de configuración aplica los snapshots y valida la integridad en una sola transacción: si el resultado es inconsistente se revierte y se conserva la configuración anterior.

### Outbox (OPERATIVO → ADMINISTRATIVO)

Cada alta o cambio de tickets, pagos, sesiones de efectivo, turnos, movimientos, cortes y movimientos de pensionados queda registrado en `outbox_events` en la misma transacción (triggers de Postgres). El scheduler (`OUTBOX_SYNC_ENABLED`) los envía en orden a `POST /api/sync/events`; sin conexión espera con backoff y reintenta sin límite. La nube descarta los repetidos por `eventId`.

No debe reintroducirse CRUD administrativo público en esta API.
 
### Recibir snapshot de accesos

```http
PUT /api/sync/snapshots/access
Authorization: Bearer <SYNC_SERVICE_TOKEN>
X-Viggo-Sync-Source: administrativo
Content-Type: application/json
```

```json
{
  "version": 1784820000000,
  "users": [],
  "permissionProfiles": []
}
```

Este endpoint hace upsert de usuarios y perfiles enviados por `ADMINISTRATIVO`. El POS/dashboard local inicia sesion contra `OPERATIVO` usando esa copia local, lo que permite operar aun sin conexion a internet.
# Nota: codigo corto de proyecto

`codigoProyecto` es un codigo de 4 digitos generado por `ADMINISTRATIVO` (`0001` a `9999`). `OPERATIVO` no lo genera; solo lo conserva como dato sincronizado para identificar el parking localmente.
# Nota: puerto local

`OPERATIVO` usa el `PORT` configurado en `.env.dev` (por defecto `3002`). Si ese puerto ya esta ocupado, usa `OPERATIVO_FALLBACK_PORT` (por defecto `3005`).

# Nota: consulta directa desde ADMINISTRATIVO

Modo actual para monitoreo: `ADMINISTRATIVO` consulta a `OPERATIVO` cuando el parking esta alcanzable.

```http
GET /api/local-reports/snapshot?proyectoId=<id>&from=<epoch>&to=<epoch>
Authorization: Bearer <SYNC_SERVICE_TOKEN>
X-Viggo-Sync-Source: administrativo-direct-query
```

Este endpoint devuelve salud local, resumen de tickets, cobros, turnos abiertos y movimientos recientes. No copia toda la BD local; entrega un snapshot operativo acotado. Lo que pasa sin conexion llega a la nube por el outbox.

# Nota: token de instalacion cifrado

ADMINISTRATIVO genera un token de vinculacion al crear el proyecto. Al solicitar vinculacion, OPERATIVO pide ingresar ese token, lo manda a ADMINISTRATIVO para validar el proyecto y lo guarda cifrado en la base local dentro de `local_installation.encrypted_sync_token` usando `INSTALLATION_SECRET_KEY` o, como respaldo de desarrollo, `JWT_SEED`.

En campo se recomienda configurar una llave dedicada:

```env
INSTALLATION_SECRET_KEY=<secreto-largo-aleatorio>
```
