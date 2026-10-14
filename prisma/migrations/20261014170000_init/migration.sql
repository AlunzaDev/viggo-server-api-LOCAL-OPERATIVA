-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "user_app" AS ENUM ('ADMIN_WEB', 'OPERATIVE_WEB', 'OPERATIVE_MOBILE');

-- CreateEnum
CREATE TYPE "user_module" AS ENUM ('cashPayments', 'users', 'permissionProfiles', 'installations', 'projects', 'modules', 'pensions', 'pensionPasses', 'tickets', 'pensionMoves', 'payments');

-- CreateEnum
CREATE TYPE "modulo_tipo" AS ENUM ('ENTRADA', 'SALIDA', 'POS');

-- CreateEnum
CREATE TYPE "submodulo_tipo" AS ENUM ('QR_SCANNER', 'PRINTER', 'BARRIER', 'CAMERA', 'CASH_DRAWER', 'CASH_ACCEPTOR', 'DISPLAY', 'KEYPAD', 'OTHER');

-- CreateEnum
CREATE TYPE "remote_support_provider" AS ENUM ('MESHCENTRAL', 'RUSTDESK', 'VIGGO_REMOTE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "device_connection_status" AS ENUM ('CONNECTED', 'DISCONNECTED', 'PENDING', 'REJECTED', 'MISMATCH');

-- CreateEnum
CREATE TYPE "device_approval_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ticket_status" AS ENUM ('ACTIVE', 'COMPLETED', 'FRAUD');

-- CreateEnum
CREATE TYPE "pension_move_tipo" AS ENUM ('ENTRADA', 'SALIDA', 'ENTRADA-PENSION', 'SALIDA-PENSION');

-- CreateEnum
CREATE TYPE "payment_type" AS ENUM ('ticket', 'pension', 'renewal');

-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('succeeded', 'pending', 'failed', 'refunded');

-- CreateEnum
CREATE TYPE "cash_payment_session_status" AS ENUM ('created', 'pending_cash', 'partially_paid', 'paid', 'cancelled', 'expired', 'failed');

-- CreateEnum
CREATE TYPE "cash_payment_session_event_type" AS ENUM ('session_created', 'qr_resolved', 'cash_inserted', 'cash_rejected', 'change_calculated', 'session_completed', 'session_cancelled', 'session_expired', 'session_failed');

-- CreateEnum
CREATE TYPE "cash_register_shift_status" AS ENUM ('open', 'closed', 'reconciled', 'cancelled');

-- CreateEnum
CREATE TYPE "cash_register_movement_type" AS ENUM ('opening_fund', 'ticket_payment_income', 'manual_income', 'manual_expense', 'cash_withdrawal', 'refund', 'adjustment');

-- CreateEnum
CREATE TYPE "cash_movement_direction" AS ENUM ('in', 'out');

-- CreateEnum
CREATE TYPE "cash_register_cut_status" AS ENUM ('balanced', 'short', 'over');

-- CreateEnum
CREATE TYPE "operational_log_kind" AS ENUM ('event', 'incident');

-- CreateEnum
CREATE TYPE "operational_log_scope" AS ENUM ('access_flow', 'device', 'payment', 'system');

-- CreateEnum
CREATE TYPE "operational_log_severity" AS ENUM ('info', 'warning', 'critical');

-- CreateEnum
CREATE TYPE "operational_log_source" AS ENUM ('backend', 'device', 'app', 'sync', 'system');

-- CreateEnum
CREATE TYPE "operational_log_flush_type" AS ENUM ('monthly', 'partial');

-- CreateEnum
CREATE TYPE "monthly_flush_trigger" AS ENUM ('manual', 'automatic', 'partial');

-- CreateEnum
CREATE TYPE "monthly_flush_job_status" AS ENUM ('running', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "local_installation_status" AS ENUM ('pending', 'requested', 'approved', 'rejected', 'linked');

-- CreateEnum
CREATE TYPE "local_installation_source" AS ENUM ('env', 'manual', 'cloudApproval');

-- CreateEnum
CREATE TYPE "config_sync_status" AS ENUM ('success', 'success_with_warnings', 'failed');

-- CreateEnum
CREATE TYPE "config_sync_trigger" AS ENUM ('manual', 'automatic', 'system');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellido" TEXT NOT NULL,
    "correo" TEXT NOT NULL,
    "email_validated" BOOLEAN NOT NULL DEFAULT false,
    "telefono" TEXT NOT NULL,
    "coordinates" DOUBLE PRECISION[] DEFAULT ARRAY[]::DOUBLE PRECISION[],
    "password" TEXT NOT NULL,
    "rol" TEXT NOT NULL DEFAULT 'CLIENT_ROLE',
    "parkings" UUID[] DEFAULT ARRAY[]::UUID[],
    "allowed_apps" "user_app"[] DEFAULT ARRAY[]::"user_app"[],
    "nacimiento" TIMESTAMPTZ(3),
    "img" TEXT NOT NULL DEFAULT '',
    "estado" BOOLEAN NOT NULL DEFAULT true,
    "google" BOOLEAN NOT NULL DEFAULT false,
    "barrier_blaster_high_score" INTEGER NOT NULL DEFAULT 0,
    "sync_source" TEXT NOT NULL DEFAULT 'administrativo',
    "last_synced_at" TIMESTAMPTZ(3),
    "last_cloud_check_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuario_app_permissions" (
    "usuario_id" UUID NOT NULL,
    "app" "user_app" NOT NULL,
    "permission_profile_id" UUID NOT NULL,

    CONSTRAINT "usuario_app_permissions_pkey" PRIMARY KEY ("usuario_id","app")
);

-- CreateTable
CREATE TABLE "permission_profiles" (
    "id" UUID NOT NULL,
    "app" "user_app" NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL DEFAULT '',
    "modules" "user_module"[] DEFAULT ARRAY[]::"user_module"[],
    "estado" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "permission_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proyectos" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "coordinates" JSONB NOT NULL,
    "ciudad" TEXT NOT NULL,
    "direccion" TEXT NOT NULL DEFAULT '',
    "identificador" TEXT NOT NULL,
    "codigo_proyecto" VARCHAR(4),
    "server_ip" TEXT NOT NULL DEFAULT '',
    "server_mac" TEXT NOT NULL DEFAULT '',
    "local_api_base_url" TEXT NOT NULL DEFAULT '',
    "img" TEXT NOT NULL DEFAULT '',
    "descripcion" TEXT NOT NULL DEFAULT '',
    "estado" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "proyectos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proyecto_remote_support" (
    "proyecto_id" UUID NOT NULL,
    "provider" "remote_support_provider" NOT NULL DEFAULT 'MESHCENTRAL',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "base_url" TEXT NOT NULL DEFAULT '',
    "group_id" TEXT NOT NULL DEFAULT '',
    "updated_at" TIMESTAMPTZ(3),

    CONSTRAINT "proyecto_remote_support_pkey" PRIMARY KEY ("proyecto_id")
);

-- CreateTable
CREATE TABLE "modulos" (
    "id" UUID NOT NULL,
    "proyecto_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "modulo_tipo" NOT NULL,
    "estado" BOOLEAN NOT NULL DEFAULT true,
    "identificador" TEXT NOT NULL,
    "ip" TEXT NOT NULL DEFAULT '',
    "mac" TEXT NOT NULL DEFAULT '',
    "ubicacion" TEXT NOT NULL DEFAULT '',
    "longitude" DOUBLE PRECISION,
    "latitude" DOUBLE PRECISION,
    "descripcion" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "modulos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submodulos" (
    "id" UUID NOT NULL,
    "modulo_id" UUID NOT NULL,
    "submodulo_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "nombre" TEXT NOT NULL,
    "tipo" "submodulo_tipo" NOT NULL DEFAULT 'OTHER',
    "identificador" TEXT NOT NULL DEFAULT '',
    "ip" TEXT NOT NULL DEFAULT '',
    "mac" TEXT NOT NULL DEFAULT '',
    "ubicacion" TEXT NOT NULL DEFAULT '',
    "longitude" DOUBLE PRECISION,
    "latitude" DOUBLE PRECISION,
    "descripcion" TEXT NOT NULL DEFAULT '',
    "estado" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "submodulos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modulo_remote_support" (
    "modulo_id" UUID NOT NULL,
    "provider" "remote_support_provider" NOT NULL DEFAULT 'MESHCENTRAL',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "device_name" TEXT NOT NULL DEFAULT '',
    "device_id" TEXT NOT NULL DEFAULT '',
    "group_id" TEXT NOT NULL DEFAULT '',
    "base_url" TEXT NOT NULL DEFAULT '',
    "support_url" TEXT NOT NULL DEFAULT '',
    "desktop_url" TEXT NOT NULL DEFAULT '',
    "terminal_url" TEXT NOT NULL DEFAULT '',
    "linked_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3),

    CONSTRAINT "modulo_remote_support_pkey" PRIMARY KEY ("modulo_id")
);

-- CreateTable
CREATE TABLE "modulo_device_bindings" (
    "modulo_id" UUID NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "cpu_serial" TEXT NOT NULL DEFAULT '',
    "machine_id" TEXT NOT NULL DEFAULT '',
    "primary_mac" TEXT NOT NULL DEFAULT '',
    "device_secret_hash" TEXT NOT NULL DEFAULT '',
    "device_secret_issued_at" TIMESTAMPTZ(3),
    "bound_at" TIMESTAMPTZ(3) NOT NULL,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "modulo_device_bindings_pkey" PRIMARY KEY ("modulo_id")
);

-- CreateTable
CREATE TABLE "modulo_device_binding_requests" (
    "id" UUID NOT NULL,
    "modulo_id" UUID NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "cpu_serial" TEXT NOT NULL DEFAULT '',
    "machine_id" TEXT NOT NULL DEFAULT '',
    "primary_mac" TEXT NOT NULL DEFAULT '',
    "ip_address" TEXT NOT NULL DEFAULT '',
    "location_label" TEXT NOT NULL DEFAULT '',
    "status" "device_approval_status" NOT NULL,
    "requested_at" TIMESTAMPTZ(3) NOT NULL,
    "resolved_at" TIMESTAMPTZ(3),
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "modulo_device_binding_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modulo_connection_audits" (
    "modulo_id" UUID NOT NULL,
    "fingerprint" TEXT NOT NULL DEFAULT '',
    "cpu_serial" TEXT NOT NULL DEFAULT '',
    "machine_id" TEXT NOT NULL DEFAULT '',
    "primary_mac" TEXT NOT NULL DEFAULT '',
    "ip_address" TEXT NOT NULL DEFAULT '',
    "location_label" TEXT NOT NULL DEFAULT '',
    "socket_id" TEXT NOT NULL DEFAULT '',
    "status" "device_approval_status" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT NOT NULL DEFAULT '',
    "attempted_at" TIMESTAMPTZ(3),

    CONSTRAINT "modulo_connection_audits_pkey" PRIMARY KEY ("modulo_id")
);

-- CreateTable
CREATE TABLE "modulo_device_runtimes" (
    "modulo_id" UUID NOT NULL,
    "fingerprint" TEXT NOT NULL DEFAULT '',
    "socket_id" TEXT NOT NULL DEFAULT '',
    "ip_address" TEXT NOT NULL DEFAULT '',
    "location_label" TEXT NOT NULL DEFAULT '',
    "connection_status" "device_connection_status" NOT NULL DEFAULT 'DISCONNECTED',
    "is_connected" BOOLEAN NOT NULL DEFAULT false,
    "is_authorized" BOOLEAN NOT NULL DEFAULT false,
    "connected_at" TIMESTAMPTZ(3),
    "last_heartbeat_at" TIMESTAMPTZ(3),
    "last_disconnect_at" TIMESTAMPTZ(3),
    "message" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "modulo_device_runtimes_pkey" PRIMARY KEY ("modulo_id")
);

-- CreateTable
CREATE TABLE "pensiones" (
    "id" UUID NOT NULL,
    "proyecto_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "precio" DECIMAL(12,2) NOT NULL,
    "descripcion" TEXT NOT NULL DEFAULT '',
    "estado" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "pensiones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pension_horarios" (
    "pension_id" UUID NOT NULL,
    "week_day" SMALLINT NOT NULL,
    "from_minutes" SMALLINT NOT NULL,
    "to_minutes" SMALLINT NOT NULL,

    CONSTRAINT "pension_horarios_pkey" PRIMARY KEY ("pension_id","week_day")
);

-- CreateTable
CREATE TABLE "pension_passes" (
    "id" UUID NOT NULL,
    "pension_id" UUID NOT NULL,
    "usuario_id" UUID,
    "name" TEXT NOT NULL,
    "id_pass" TEXT NOT NULL,
    "vigent" BOOLEAN NOT NULL DEFAULT false,
    "anti_passback" BOOLEAN NOT NULL DEFAULT true,
    "in_parking" BOOLEAN NOT NULL DEFAULT false,
    "created" TIMESTAMPTZ(3) NOT NULL,
    "valid_from" TIMESTAMPTZ(3),
    "valid_to" TIMESTAMPTZ(3),
    "estado" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "pension_passes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" UUID NOT NULL,
    "proyecto_id" UUID NOT NULL,
    "entrada_id" UUID NOT NULL,
    "salida_id" UUID,
    "usuario_id" UUID NOT NULL,
    "id_boleto" TEXT NOT NULL,
    "hora_inicio" TIMESTAMPTZ(3) NOT NULL,
    "hora_consulta" TIMESTAMPTZ(3),
    "hora_cobro" TIMESTAMPTZ(3),
    "hora_salida" TIMESTAMPTZ(3),
    "duracion" INTEGER NOT NULL DEFAULT 0,
    "monto" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "pagado" BOOLEAN NOT NULL DEFAULT false,
    "status" "ticket_status" NOT NULL DEFAULT 'ACTIVE',
    "barrier_opened_at" TIMESTAMPTZ(3),
    "barrier_confirmed_at" TIMESTAMPTZ(3),
    "fraud_detected_at" TIMESTAMPTZ(3),
    "fraud_reason" TEXT NOT NULL DEFAULT '',
    "idempotency_key" TEXT,
    "exit_idempotency_key" TEXT,
    "runtime_event_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pension_moves" (
    "id" UUID NOT NULL,
    "modulo_id" UUID NOT NULL,
    "proyecto_id" UUID NOT NULL,
    "pension_pass_id" UUID NOT NULL,
    "tipo" "pension_move_tipo" NOT NULL,
    "fecha" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "pension_moves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "type" "payment_type" NOT NULL,
    "concept" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" "payment_status" NOT NULL,
    "paid_at" TIMESTAMPTZ(3) NOT NULL,
    "provider_reference" TEXT,
    "payment_method_brand" TEXT NOT NULL DEFAULT '',
    "payment_method_last4" VARCHAR(4) NOT NULL DEFAULT '',
    "reference_type" "payment_type" NOT NULL,
    "reference_id" TEXT NOT NULL,
    "proyecto_id" TEXT NOT NULL DEFAULT '',
    "parking_name" TEXT NOT NULL DEFAULT '',
    "parking_city" TEXT NOT NULL DEFAULT '',
    "raw_provider_status" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_payment_sessions" (
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "id_boleto" TEXT NOT NULL,
    "status" "cash_payment_session_status" NOT NULL,
    "amount_expected" DECIMAL(12,2) NOT NULL,
    "amount_received" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "change_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "modulo_id" UUID NOT NULL,
    "modulo_identificador" TEXT NOT NULL DEFAULT '',
    "modulo_nombre" TEXT NOT NULL DEFAULT '',
    "device_id" TEXT NOT NULL DEFAULT '',
    "cash_register_shift_id" UUID,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "completed_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),

    CONSTRAINT "cash_payment_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_payment_session_events" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "type" "cash_payment_session_event_type" NOT NULL,
    "amount" DECIMAL(12,2),
    "idempotency_key" TEXT,
    "payload" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cash_payment_session_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_register_shifts" (
    "id" UUID NOT NULL,
    "proyecto_id" UUID NOT NULL,
    "modulo_id" UUID NOT NULL,
    "modulo_identificador" TEXT NOT NULL DEFAULT '',
    "modulo_nombre" TEXT NOT NULL DEFAULT '',
    "opened_by_user_id" UUID NOT NULL,
    "opened_by_user_name" TEXT NOT NULL DEFAULT '',
    "status" "cash_register_shift_status" NOT NULL,
    "opening_amount" DECIMAL(12,2) NOT NULL,
    "opened_at" TIMESTAMPTZ(3) NOT NULL,
    "closed_at" TIMESTAMPTZ(3),
    "closing_amount_expected" DECIMAL(12,2),
    "closing_amount_counted" DECIMAL(12,2),
    "difference_amount" DECIMAL(12,2),
    "notes" TEXT NOT NULL DEFAULT '',
    "metadata" JSONB,

    CONSTRAINT "cash_register_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_register_movements" (
    "id" UUID NOT NULL,
    "shift_id" UUID NOT NULL,
    "proyecto_id" UUID NOT NULL,
    "modulo_id" UUID NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "created_by_user_name" TEXT NOT NULL DEFAULT '',
    "type" "cash_register_movement_type" NOT NULL,
    "direction" "cash_movement_direction" NOT NULL,
    "concept" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "related_ticket_id" TEXT,
    "related_payment_id" TEXT,
    "related_cash_payment_session_id" UUID,
    "idempotency_key" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "metadata" JSONB,

    CONSTRAINT "cash_register_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_register_counts" (
    "id" UUID NOT NULL,
    "shift_id" UUID NOT NULL,
    "counted_by_user_id" TEXT NOT NULL,
    "counted_by_user_name" TEXT NOT NULL DEFAULT '',
    "counted_at" TIMESTAMPTZ(3) NOT NULL,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "cash_register_counts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_register_count_lines" (
    "count_id" UUID NOT NULL,
    "position" SMALLINT NOT NULL,
    "label" TEXT NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "cash_register_count_lines_pkey" PRIMARY KEY ("count_id","position")
);

-- CreateTable
CREATE TABLE "cash_register_cuts" (
    "id" UUID NOT NULL,
    "shift_id" UUID NOT NULL,
    "generated_by_user_id" TEXT NOT NULL,
    "generated_by_user_name" TEXT NOT NULL DEFAULT '',
    "generated_at" TIMESTAMPTZ(3) NOT NULL,
    "opening_amount" DECIMAL(12,2) NOT NULL,
    "total_in" DECIMAL(12,2) NOT NULL,
    "total_out" DECIMAL(12,2) NOT NULL,
    "expected_amount" DECIMAL(12,2) NOT NULL,
    "counted_amount" DECIMAL(12,2) NOT NULL,
    "difference_amount" DECIMAL(12,2) NOT NULL,
    "status" "cash_register_cut_status" NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "cash_register_cuts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "local_installation" (
    "key" TEXT NOT NULL DEFAULT 'default',
    "installation_id" TEXT NOT NULL DEFAULT '',
    "proyecto_id" TEXT NOT NULL DEFAULT '',
    "proyecto_nombre" TEXT NOT NULL DEFAULT '',
    "proyecto_identificador" TEXT NOT NULL DEFAULT '',
    "source" "local_installation_source" NOT NULL DEFAULT 'manual',
    "status" "local_installation_status" NOT NULL DEFAULT 'pending',
    "cloud_request_id" TEXT NOT NULL DEFAULT '',
    "encrypted_sync_token" TEXT NOT NULL DEFAULT '',
    "sync_token_issued_at" TIMESTAMPTZ(3),
    "sync_token_rotated_at" TIMESTAMPTZ(3),
    "review_note" TEXT NOT NULL DEFAULT '',
    "requested_at" TIMESTAMPTZ(3),
    "reviewed_at" TIMESTAMPTZ(3),
    "assigned_by_user_id" TEXT NOT NULL DEFAULT '',
    "assigned_at" TIMESTAMPTZ(3),
    "last_configuration_version" INTEGER,
    "last_access_version" INTEGER,
    "last_sync_at" TIMESTAMPTZ(3),
    "last_sync_status" "config_sync_status",
    "last_sync_error" TEXT NOT NULL DEFAULT '',
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "local_installation_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "mobile_command_receipts" (
    "operation_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "processed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mobile_command_receipts_pkey" PRIMARY KEY ("operation_id")
);

-- CreateTable
CREATE TABLE "config_sync_audits" (
    "id" UUID NOT NULL,
    "installation_id" TEXT NOT NULL,
    "proyecto_id" TEXT NOT NULL DEFAULT '',
    "proyecto_nombre" TEXT NOT NULL DEFAULT '',
    "triggered_by_user_id" TEXT NOT NULL DEFAULT '',
    "triggered_by_user_name" TEXT NOT NULL DEFAULT '',
    "trigger_source" "config_sync_trigger" NOT NULL DEFAULT 'manual',
    "status" "config_sync_status" NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "finished_at" TIMESTAMPTZ(3) NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "configuration_version" INTEGER,
    "access_version" INTEGER,
    "counts" JSONB NOT NULL DEFAULT '{}',
    "error_message" TEXT NOT NULL DEFAULT '',
    "error_code" TEXT NOT NULL DEFAULT '',
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "config_sync_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operational_logs" (
    "id" UUID NOT NULL,
    "kind" "operational_log_kind" NOT NULL,
    "scope" "operational_log_scope" NOT NULL,
    "type" TEXT NOT NULL,
    "severity" "operational_log_severity" NOT NULL,
    "installation_id" TEXT NOT NULL DEFAULT '',
    "project_id" TEXT NOT NULL DEFAULT '',
    "project_name" TEXT NOT NULL DEFAULT '',
    "modulo_id" TEXT NOT NULL DEFAULT '',
    "modulo_nombre" TEXT NOT NULL DEFAULT '',
    "submodulo_id" TEXT NOT NULL DEFAULT '',
    "submodulo_nombre" TEXT NOT NULL DEFAULT '',
    "ticket_id" TEXT NOT NULL DEFAULT '',
    "payment_session_id" TEXT NOT NULL DEFAULT '',
    "flow_id" TEXT NOT NULL DEFAULT '',
    "source" "operational_log_source" NOT NULL,
    "message" TEXT NOT NULL,
    "status_before" TEXT NOT NULL DEFAULT '',
    "status_after" TEXT NOT NULL DEFAULT '',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "operational_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operational_log_flush_summaries" (
    "id" UUID NOT NULL,
    "month_key" TEXT NOT NULL,
    "day_key" TEXT NOT NULL,
    "flush_type" "operational_log_flush_type" NOT NULL,
    "kind" "operational_log_kind" NOT NULL,
    "scope" "operational_log_scope" NOT NULL,
    "severity" "operational_log_severity" NOT NULL,
    "type" TEXT NOT NULL,
    "installation_id" TEXT NOT NULL DEFAULT '',
    "project_id" TEXT NOT NULL DEFAULT '',
    "project_name" TEXT NOT NULL DEFAULT '',
    "modulo_id" TEXT NOT NULL DEFAULT '',
    "modulo_nombre" TEXT NOT NULL DEFAULT '',
    "source" "operational_log_source" NOT NULL,
    "total_logs" INTEGER NOT NULL DEFAULT 0,
    "first_created_at" TIMESTAMPTZ(3) NOT NULL,
    "last_created_at" TIMESTAMPTZ(3) NOT NULL,
    "sample_message" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "operational_log_flush_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_flush_config" (
    "key" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "partial_current_month_enabled" BOOLEAN NOT NULL DEFAULT false,
    "close_day" SMALLINT NOT NULL DEFAULT 1,
    "partial_days" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "hour" SMALLINT NOT NULL DEFAULT 2,
    "minute" SMALLINT NOT NULL DEFAULT 0,
    "last_automatic_run_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by_user_id" TEXT NOT NULL DEFAULT '',
    "updated_by_user_name" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "monthly_flush_config_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "monthly_flush_jobs" (
    "id" UUID NOT NULL,
    "month_key" TEXT NOT NULL,
    "trigger_type" "monthly_flush_trigger" NOT NULL,
    "status" "monthly_flush_job_status" NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "completed_at" TIMESTAMPTZ(3),
    "error" TEXT,
    "requested_by_user_id" TEXT NOT NULL DEFAULT '',
    "requested_by_user_name" TEXT NOT NULL DEFAULT '',
    "summary" JSONB,

    CONSTRAINT "monthly_flush_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "event_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_error" TEXT NOT NULL DEFAULT '',
    "sent_at" TIMESTAMPTZ(3),

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("event_id")
);

-- CreateIndex
CREATE INDEX "usuarios_correo_idx" ON "usuarios"("correo");

-- CreateIndex
CREATE INDEX "usuarios_telefono_idx" ON "usuarios"("telefono");

-- CreateIndex
CREATE INDEX "usuarios_parkings_idx" ON "usuarios" USING GIN ("parkings");

-- CreateIndex
CREATE INDEX "usuarios_rol_idx" ON "usuarios"("rol");

-- CreateIndex
CREATE INDEX "usuario_app_permissions_permission_profile_id_idx" ON "usuario_app_permissions"("permission_profile_id");

-- CreateIndex
CREATE INDEX "permission_profiles_app_idx" ON "permission_profiles"("app");

-- CreateIndex
CREATE INDEX "proyectos_identificador_idx" ON "proyectos"("identificador");

-- CreateIndex
CREATE INDEX "modulos_proyecto_id_tipo_estado_idx" ON "modulos"("proyecto_id", "tipo", "estado");

-- CreateIndex
CREATE INDEX "modulos_identificador_idx" ON "modulos"("identificador");

-- CreateIndex
CREATE INDEX "submodulos_modulo_id_position_idx" ON "submodulos"("modulo_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "submodulos_modulo_id_submodulo_id_key" ON "submodulos"("modulo_id", "submodulo_id");

-- CreateIndex
CREATE INDEX "modulo_device_bindings_fingerprint_idx" ON "modulo_device_bindings"("fingerprint");

-- CreateIndex
CREATE INDEX "modulo_device_binding_requests_status_requested_at_idx" ON "modulo_device_binding_requests"("status", "requested_at");

-- CreateIndex
CREATE INDEX "modulo_device_binding_requests_modulo_id_requested_at_idx" ON "modulo_device_binding_requests"("modulo_id", "requested_at");

-- CreateIndex
CREATE UNIQUE INDEX "modulo_device_binding_requests_pending_key" ON "modulo_device_binding_requests"("modulo_id", "fingerprint") WHERE (status = 'PENDING'::device_approval_status);

-- CreateIndex
CREATE INDEX "modulo_device_runtimes_is_connected_last_heartbeat_at_idx" ON "modulo_device_runtimes"("is_connected", "last_heartbeat_at");

-- CreateIndex
CREATE INDEX "pensiones_proyecto_id_estado_idx" ON "pensiones"("proyecto_id", "estado");

-- CreateIndex
CREATE INDEX "pension_passes_id_pass_idx" ON "pension_passes"("id_pass");

-- CreateIndex
CREATE INDEX "pension_passes_pension_id_idx" ON "pension_passes"("pension_id");

-- CreateIndex
CREATE INDEX "pension_passes_usuario_id_idx" ON "pension_passes"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_id_boleto_key" ON "tickets"("id_boleto");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_idempotency_key_key" ON "tickets"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_exit_idempotency_key_key" ON "tickets"("exit_idempotency_key");

-- CreateIndex
CREATE INDEX "tickets_usuario_id_hora_inicio_idx" ON "tickets"("usuario_id", "hora_inicio" DESC);

-- CreateIndex
CREATE INDEX "tickets_proyecto_id_hora_inicio_idx" ON "tickets"("proyecto_id", "hora_inicio" DESC);

-- CreateIndex
CREATE INDEX "tickets_status_hora_inicio_idx" ON "tickets"("status", "hora_inicio");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_active_usuario_key" ON "tickets"("usuario_id") WHERE (status = 'ACTIVE'::ticket_status);

-- CreateIndex
CREATE INDEX "pension_moves_pension_pass_id_fecha_idx" ON "pension_moves"("pension_pass_id", "fecha" DESC);

-- CreateIndex
CREATE INDEX "pension_moves_proyecto_id_fecha_idx" ON "pension_moves"("proyecto_id", "fecha" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_reference_key" ON "payments"("provider_reference");

-- CreateIndex
CREATE INDEX "payments_usuario_id_paid_at_idx" ON "payments"("usuario_id", "paid_at" DESC);

-- CreateIndex
CREATE INDEX "payments_reference_type_reference_id_idx" ON "payments"("reference_type", "reference_id");

-- CreateIndex
CREATE INDEX "payments_paid_at_idx" ON "payments"("paid_at");

-- CreateIndex
CREATE INDEX "cash_payment_sessions_ticket_id_status_idx" ON "cash_payment_sessions"("ticket_id", "status");

-- CreateIndex
CREATE INDEX "cash_payment_sessions_id_boleto_status_idx" ON "cash_payment_sessions"("id_boleto", "status");

-- CreateIndex
CREATE INDEX "cash_payment_sessions_modulo_id_started_at_idx" ON "cash_payment_sessions"("modulo_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "cash_payment_sessions_cash_register_shift_id_idx" ON "cash_payment_sessions"("cash_register_shift_id");

-- CreateIndex
CREATE INDEX "cash_payment_sessions_started_at_idx" ON "cash_payment_sessions"("started_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "cash_payment_sessions_open_ticket_key" ON "cash_payment_sessions"("ticket_id") WHERE (status = ANY (ARRAY['created'::cash_payment_session_status, 'pending_cash'::cash_payment_session_status, 'partially_paid'::cash_payment_session_status]));

-- CreateIndex
CREATE INDEX "cash_payment_session_events_session_id_created_at_idx" ON "cash_payment_session_events"("session_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "cash_payment_session_events_session_id_idempotency_key_key" ON "cash_payment_session_events"("session_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "cash_register_shifts_modulo_id_status_idx" ON "cash_register_shifts"("modulo_id", "status");

-- CreateIndex
CREATE INDEX "cash_register_shifts_opened_by_user_id_status_idx" ON "cash_register_shifts"("opened_by_user_id", "status");

-- CreateIndex
CREATE INDEX "cash_register_shifts_proyecto_id_opened_at_idx" ON "cash_register_shifts"("proyecto_id", "opened_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "cash_register_shifts_open_modulo_key" ON "cash_register_shifts"("modulo_id") WHERE (status = 'open'::cash_register_shift_status);

-- CreateIndex
CREATE UNIQUE INDEX "cash_register_movements_related_cash_payment_session_id_key" ON "cash_register_movements"("related_cash_payment_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "cash_register_movements_idempotency_key_key" ON "cash_register_movements"("idempotency_key");

-- CreateIndex
CREATE INDEX "cash_register_movements_shift_id_created_at_idx" ON "cash_register_movements"("shift_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "cash_register_movements_proyecto_id_created_at_idx" ON "cash_register_movements"("proyecto_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "cash_register_movements_type_idx" ON "cash_register_movements"("type");

-- CreateIndex
CREATE INDEX "cash_register_counts_shift_id_counted_at_idx" ON "cash_register_counts"("shift_id", "counted_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "cash_register_cuts_shift_id_key" ON "cash_register_cuts"("shift_id");

-- CreateIndex
CREATE INDEX "cash_register_cuts_generated_at_idx" ON "cash_register_cuts"("generated_at" DESC);

-- CreateIndex
CREATE INDEX "mobile_command_receipts_processed_at_idx" ON "mobile_command_receipts"("processed_at");

-- CreateIndex
CREATE INDEX "config_sync_audits_started_at_idx" ON "config_sync_audits"("started_at" DESC);

-- CreateIndex
CREATE INDEX "config_sync_audits_status_started_at_idx" ON "config_sync_audits"("status", "started_at" DESC);

-- CreateIndex
CREATE INDEX "operational_logs_created_at_kind_idx" ON "operational_logs"("created_at" DESC, "kind");

-- CreateIndex
CREATE INDEX "operational_logs_project_id_created_at_idx" ON "operational_logs"("project_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "operational_logs_modulo_id_created_at_idx" ON "operational_logs"("modulo_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "operational_logs_ticket_id_created_at_idx" ON "operational_logs"("ticket_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "operational_logs_flow_id_idx" ON "operational_logs"("flow_id");

-- CreateIndex
CREATE INDEX "operational_logs_kind_scope_severity_created_at_idx" ON "operational_logs"("kind", "scope", "severity", "created_at" DESC);

-- CreateIndex
CREATE INDEX "operational_log_flush_summaries_month_key_day_key_idx" ON "operational_log_flush_summaries"("month_key", "day_key");

-- CreateIndex
CREATE INDEX "operational_log_flush_summaries_created_at_idx" ON "operational_log_flush_summaries"("created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "operational_log_flush_summary_unique" ON "operational_log_flush_summaries"("month_key", "day_key", "flush_type", "kind", "scope", "severity", "type", "installation_id", "project_id", "modulo_id", "source");

-- CreateIndex
CREATE INDEX "monthly_flush_jobs_started_at_idx" ON "monthly_flush_jobs"("started_at" DESC);

-- CreateIndex
CREATE INDEX "monthly_flush_jobs_month_key_trigger_type_started_at_idx" ON "monthly_flush_jobs"("month_key", "trigger_type", "started_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "monthly_flush_jobs_running_key" ON "monthly_flush_jobs"("status") WHERE (status = 'running'::monthly_flush_job_status);

-- CreateIndex
CREATE INDEX "outbox_events_pending_idx" ON "outbox_events"("next_attempt_at", "occurred_at") WHERE (sent_at IS NULL);

-- CreateIndex
CREATE INDEX "outbox_events_aggregate_type_aggregate_id_idx" ON "outbox_events"("aggregate_type", "aggregate_id");

-- CreateIndex
CREATE INDEX "outbox_events_sent_at_idx" ON "outbox_events"("sent_at");

-- AddForeignKey
ALTER TABLE "usuario_app_permissions" ADD CONSTRAINT "usuario_app_permissions_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proyecto_remote_support" ADD CONSTRAINT "proyecto_remote_support_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modulos" ADD CONSTRAINT "modulos_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submodulos" ADD CONSTRAINT "submodulos_modulo_id_fkey" FOREIGN KEY ("modulo_id") REFERENCES "modulos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modulo_remote_support" ADD CONSTRAINT "modulo_remote_support_modulo_id_fkey" FOREIGN KEY ("modulo_id") REFERENCES "modulos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modulo_device_bindings" ADD CONSTRAINT "modulo_device_bindings_modulo_id_fkey" FOREIGN KEY ("modulo_id") REFERENCES "modulos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modulo_device_binding_requests" ADD CONSTRAINT "modulo_device_binding_requests_modulo_id_fkey" FOREIGN KEY ("modulo_id") REFERENCES "modulos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modulo_connection_audits" ADD CONSTRAINT "modulo_connection_audits_modulo_id_fkey" FOREIGN KEY ("modulo_id") REFERENCES "modulos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modulo_device_runtimes" ADD CONSTRAINT "modulo_device_runtimes_modulo_id_fkey" FOREIGN KEY ("modulo_id") REFERENCES "modulos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pensiones" ADD CONSTRAINT "pensiones_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pension_horarios" ADD CONSTRAINT "pension_horarios_pension_id_fkey" FOREIGN KEY ("pension_id") REFERENCES "pensiones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pension_passes" ADD CONSTRAINT "pension_passes_pension_id_fkey" FOREIGN KEY ("pension_id") REFERENCES "pensiones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_entrada_id_fkey" FOREIGN KEY ("entrada_id") REFERENCES "modulos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_salida_id_fkey" FOREIGN KEY ("salida_id") REFERENCES "modulos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pension_moves" ADD CONSTRAINT "pension_moves_modulo_id_fkey" FOREIGN KEY ("modulo_id") REFERENCES "modulos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pension_moves" ADD CONSTRAINT "pension_moves_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pension_moves" ADD CONSTRAINT "pension_moves_pension_pass_id_fkey" FOREIGN KEY ("pension_pass_id") REFERENCES "pension_passes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_payment_sessions" ADD CONSTRAINT "cash_payment_sessions_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_payment_sessions" ADD CONSTRAINT "cash_payment_sessions_modulo_id_fkey" FOREIGN KEY ("modulo_id") REFERENCES "modulos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_payment_sessions" ADD CONSTRAINT "cash_payment_sessions_cash_register_shift_id_fkey" FOREIGN KEY ("cash_register_shift_id") REFERENCES "cash_register_shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_payment_session_events" ADD CONSTRAINT "cash_payment_session_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "cash_payment_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_register_shifts" ADD CONSTRAINT "cash_register_shifts_modulo_id_fkey" FOREIGN KEY ("modulo_id") REFERENCES "modulos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_register_movements" ADD CONSTRAINT "cash_register_movements_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "cash_register_shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_register_movements" ADD CONSTRAINT "cash_register_movements_related_cash_payment_session_id_fkey" FOREIGN KEY ("related_cash_payment_session_id") REFERENCES "cash_payment_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_register_counts" ADD CONSTRAINT "cash_register_counts_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "cash_register_shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_register_count_lines" ADD CONSTRAINT "cash_register_count_lines_count_id_fkey" FOREIGN KEY ("count_id") REFERENCES "cash_register_counts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_register_cuts" ADD CONSTRAINT "cash_register_cuts_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "cash_register_shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
