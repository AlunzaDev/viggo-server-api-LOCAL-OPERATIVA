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
Copy-Item .env.example .env
npm install
npm run check
npm run dev
```

El modo de desarrollo compila a `dist`, vigila cambios de TypeScript y reinicia Node automáticamente. No utiliza `--experimental-strip-types`.

## Docker

```powershell
Copy-Item .env.example .env
docker compose up --build
```

MongoDB sólo se publica en `127.0.0.1:27017` para evitar exponerlo a la red del estacionamiento.

## Variables principales

- `MONGO_URL`
- `MONGO_DB_NAME`
- `JWT_SEED`
- `CORS_ALLOWED_ORIGINS`
- `PAYMENT_CURRENCY`
- `SYNC_SERVICE_TOKEN`
- `BARRIER_SOCKET_REQUIRED`
- `BARRIER_SOCKET_TIMEOUT_MS`

No deben agregarse credenciales de Stripe ni correo a OPERATIVO.

## Sincronización

Los modelos locales de usuarios, parkings, módulos, pensiones y Pension Pass se mantienen porque son necesarios para la operación offline. El transporte automático de configuración y eventos hacia/desde ADMINISTRATIVO es la siguiente frontera de integración; no debe reintroducir CRUD administrativo público en esta API.
 
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

`OPERATIVO` intenta iniciar en `PORT=3000`. Si ese puerto ya esta ocupado por ADMINISTRATIVO, automaticamente usa `3002`.

# Nota: consulta directa desde ADMINISTRATIVO

Modo actual para monitoreo: `ADMINISTRATIVO` consulta a `OPERATIVO` cuando el parking esta alcanzable.

```http
GET /api/local-reports/snapshot?proyectoId=<id>&from=<epoch>&to=<epoch>
Authorization: Bearer <SYNC_SERVICE_TOKEN>
X-Viggo-Sync-Source: administrativo-direct-query
```

Este endpoint devuelve salud local, resumen de tickets, cobros, turnos abiertos y movimientos recientes. No copia toda la BD local; entrega un snapshot operativo acotado. El patron outbox/inbox queda reservado para una fase posterior donde se requiera tolerancia total a desconexion.

# Nota: token de instalacion cifrado

ADMINISTRATIVO genera un token de vinculacion al crear el proyecto. Al solicitar vinculacion, OPERATIVO pide ingresar ese token, lo manda a ADMINISTRATIVO para validar el proyecto y lo guarda cifrado en Mongo local dentro de `localinstallations.encryptedSyncToken` usando `INSTALLATION_SECRET_KEY` o, como respaldo de desarrollo, `JWT_SEED`.

En campo se recomienda configurar una llave dedicada:

```env
INSTALLATION_SECRET_KEY=<secreto-largo-aleatorio>
```
