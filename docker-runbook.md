# Viggo Operativo API Docker

## Objetivo

Levantar por proyecto:

- MongoDB single-node replica set.
- API Operativa.
- Backups automaticos con `mongodump`.

La Web Operativa se levanta aparte desde `viggo-web-OPERATIVA`.

## Preparacion

Desde `viggo-server-api-OPERATIVA`:

```bash
copy .env.docker.example .env.docker
```

Editar `.env.docker`.

Valores obligatorios:

- `JWT_SEED`
- `INSTALLATION_SECRET_KEY`
- `ADMINISTRATIVO_API_URL`
- `SYNC_SERVICE_TOKEN`

## Levantar API

```bash
docker compose --env-file .env.docker up -d --build
```

## Ver estado

```bash
docker compose --env-file .env.docker ps
docker compose --env-file .env.docker logs -f backend
```

Healthchecks:

- API: `http://localhost:8081/api/health`
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

Los backups se guardan en:

```text
viggo-server-api-OPERATIVA/backups
```

Por default:

- frecuencia: 1 hora;
- retencion: 14 dias.

## Restaurar backup

Detener API antes de restaurar:

```bash
docker compose --env-file .env.docker stop backend
```

Restaurar:

```bash
docker compose --env-file .env.docker exec mongo-db mongorestore --drop /backups/NOMBRE_DEL_BACKUP/viggo-operativo
```

Volver a levantar API:

```bash
docker compose --env-file .env.docker start backend
```

## Notas

- Mongo se expone solo en `127.0.0.1`.
- Mongo corre como replica set `rs0`, necesario para transacciones locales.
- API y Mongo reinician con `restart: unless-stopped`.
- Para produccion, usar secretos reales y no subir `.env.docker`.
