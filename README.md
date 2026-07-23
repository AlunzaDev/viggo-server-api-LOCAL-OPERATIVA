# Viggo Server API — LOCALOPE

Backend operativo instalado en cada estacionamiento. Su prioridad es mantener funcionando entradas, salidas, caja, pensiones y dispositivos aunque la conexión con la nube no esté disponible.

## Frontera con NUBEADMIN

`NUBEADMIN` es la autoridad sobre:

- Registro, validación y recuperación de cuentas.
- CRUD de usuarios, roles y perfiles de permisos.
- Alta y configuración comercial de parkings.
- Alta y configuración de módulos.
- Planes de pensión y contratos Pension Pass.
- Stripe, pagos móviles y proveedores.

`LOCALOPE` conserva proyecciones locales de usuarios, parkings, módulos, planes y contratos porque las necesita para operar sin conexión. Esas proyecciones se consultan localmente, pero ya no se administran mediante esta API.

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

La aprobación, rechazo, reapertura y reinicio del **binding físico de dispositivos** sí permanecen en LOCALOPE porque forman parte del runtime del estacionamiento.

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
- `BARRIER_SOCKET_REQUIRED`
- `BARRIER_SOCKET_TIMEOUT_MS`

No deben agregarse credenciales de Stripe ni correo a LOCALOPE.

## Sincronización

Los modelos locales de usuarios, parkings, módulos, pensiones y Pension Pass se mantienen porque son necesarios para la operación offline. El transporte automático de configuración y eventos hacia/desde NUBEADMIN es la siguiente frontera de integración; no debe reintroducir CRUD administrativo público en esta API.
