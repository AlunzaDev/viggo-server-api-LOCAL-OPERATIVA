# Viggo Operativo API Docker

## Objetivo

Levantar por estacionamiento:

- PostgreSQL 17 (solo accesible desde la misma maquina).
- Migraciones de base de datos (se aplican solas antes de arrancar la API).
- API Operativa.
- Respaldos automaticos con `pg_dump`.

La Web Operativa se levanta aparte desde `viggo-web-OPERATIVA`.

El servidor funciona sin internet: la operacion se guarda en Postgres y los eventos
pendientes (outbox) se envian a ADMINISTRATIVO cuando vuelve la conexion.

## Preparacion

Desde `viggo-server-api-OPERATIVA`:

```bash
copy .env.docker.example .env.docker
```

Editar `.env.docker`.

Valores obligatorios:

- `POSTGRES_PASSWORD` (antes del primer arranque; se usa al crear la base)
- `JWT_SEED`
- `INSTALLATION_SECRET_KEY`
- `ADMINISTRATIVO_API_URL`
- `SYNC_SERVICE_TOKEN`

## Levantar API

```bash
docker compose --env-file .env.docker up -d --build
```

El servicio `migrate` aplica las migraciones pendientes y termina; la API solo arranca si
las migraciones terminaron bien.

## Ver estado

```bash
docker compose --env-file .env.docker ps
docker compose --env-file .env.docker logs -f backend
```

Healthchecks:

- API y base de datos: `http://localhost:8081/api/health`
- Devices: `http://localhost:8081/api/health/devices`

## Levantar Web Operativa

Desde `viggo-web-OPERATIVA`:

```bash
copy .env.docker.example .env.docker
docker compose --env-file .env.docker up -d --build
```

Web:

- `http://localhost:3004`

## Backups

El contenedor `postgres-backup` genera un `pg_dump` (formato custom) en:

```text
viggo-server-api-OPERATIVA/backups/postgres/viggo_operativo-AAAAMMDD-HHMMSS.dump
```

Por default:

- frecuencia: 1 hora (`BACKUP_INTERVAL_SECONDS`);
- retencion: 14 dias (`BACKUP_RETENTION_DAYS`).

Un respaldo fallido nunca reemplaza a uno bueno (se escribe primero a un `.tmp`).

## Restaurar backup

Detener la API antes de restaurar:

```bash
docker compose --env-file .env.docker stop backend
```

Restaurar (reemplaza el contenido de la base):

```bash
docker compose --env-file .env.docker cp backups/postgres/NOMBRE.dump postgres:/tmp/restore.dump
docker compose --env-file .env.docker exec postgres pg_restore --clean --if-exists -U viggo -d viggo_operativo /tmp/restore.dump
```

Volver a levantar API:

```bash
docker compose --env-file .env.docker start backend
```

## Notas

- Postgres se expone solo en `127.0.0.1:5435`.
- API y Postgres reinician con `restart: unless-stopped`.
- Los eventos ya enviados a la nube se borran despues de `OUTBOX_RETENTION_DAYS` (30 por default).
- Para produccion, usar secretos reales y no subir `.env.docker`.
