# Retención de datos

Qué guarda OPERATIVO (la PC de cada estacionamiento), cuánto tiempo y por qué (AlunzaDev/viggo-server-app-REFACTO#69). La nube conserva el historial completo: ver `docs/retencion.md` de ADMINISTRATIVO.

Principios:

- **La PC solo guarda lo que necesita para operar** y para sus reportes locales; el historial vive en la nube.
- **Nada que la nube no haya confirmado se borra**: un registro con algún evento del outbox sin enviar (`sent_at IS NULL`) se conserva, sin importar su antigüedad. Como los eventos sin enviar nunca se purgan, que no quede ninguno pendiente significa que la nube ya lo tiene.
- **Nada abierto se borra**: tickets sin salida, sesiones de cobro, turnos o cortes de caja sin cerrar.
- **Borrar en la PC no borra en la nube**: los triggers del outbox solo emiten eventos con `INSERT` y `UPDATE`.
- **Cada plazo es una variable de entorno**; `0` desactiva esa depuración.

## Plazos

| Datos | Tablas | Plazo | Se mide por | Variable |
|---|---|---|---|---|
| Operación ya confirmada por la nube | `tickets` (con salida), `payments`, `pension_moves`, `cash_payment_sessions` y sus eventos, `cash_register_shifts`, `cash_register_movements`, `cash_register_counts` y sus líneas, `cash_register_cuts` (cerrados) | 6 meses | fecha del registro (entrada del ticket, pago, movimiento, cierre) | `RETENTION_LOCAL_OPERATION_DAYS` (180) |
| Logs operativos | `operational_logs` | Resumen y borrado mensual | mes | Monthly flush (ya existe; se configura desde la web) |
| Eventos ya enviados a la nube | `outbox_events` (`sent_at` no nulo) | 30 días | `sent_at` | `OUTBOX_RETENTION_DAYS` (30, ya existe) |
| Auditorías de sincronización y conexión | `config_sync_audits`, `modulo_connection_audits` | 90 días | fecha del registro | `RETENTION_LOCAL_AUDIT_DAYS` (90) |
| Solicitudes de vinculación resueltas | `modulo_device_binding_requests` (aprobadas o rechazadas) | 90 días | fecha de resolución | `RETENTION_LOCAL_AUDIT_DAYS` (90) |
| Recibos de comandos de la app | `mobile_command_receipts` | 30 días | fecha de recepción | `RETENTION_COMMAND_RECEIPTS_DAYS` (30) |

Lo demás no crece con el uso (catálogos, pensiones, pases, tarifas, usuarios, configuración, resúmenes de logs) o se sobrescribe (`modulo_device_runtimes`) y no se depura.

## Notas

- Los reportes locales de la PC cubren los últimos 6 meses; para periodos anteriores se usa ADMINISTRATIVO.
- Si una instalación pasa semanas sin conexión, sus registros no confirmados se conservan aunque superen los 6 meses, y se depuran cuando la nube los recibe.
