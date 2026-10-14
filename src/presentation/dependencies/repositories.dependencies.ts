// Repository builders shared by controllers, services, middlewares and sockets: the single
// place that decides which database implementation the API uses.
// Only infrastructure imports here, so any module can use them without import cycles.
import { AuthPostgresDatasource } from "../../infrastructure/datasources/auth/auth.datasource.postgres";
import { PermissionProfilePostgresDatasource } from "../../infrastructure/datasources/auth/permission-profile.datasource.postgres";
import {
  CashRegisterCountPostgresDatasource,
  CashRegisterCutPostgresDatasource,
  CashRegisterModulePostgresDatasource,
  CashRegisterMovementPostgresDatasource,
  CashRegisterShiftPostgresDatasource,
} from "../../infrastructure/datasources/cash-register/cash-register.datasources.postgres";
import { ConfigSyncPostgresDatasource } from "../../infrastructure/datasources/config/config-sync.datasource.postgres";
import { LocalInstallationPostgresDatasource } from "../../infrastructure/datasources/installation/local-installation.datasource.postgres";
import { LocalReportsPostgresDatasource } from "../../infrastructure/datasources/local-reports/local-reports.datasource.postgres";
import { MobileCommandPostgresDatasource } from "../../infrastructure/datasources/mobile/mobile-command.datasource.postgres";
import { ModuloPostgresDatasource } from "../../infrastructure/datasources/parking/modulo.datasource.postgres";
import { ProyectoPostgresDatasource } from "../../infrastructure/datasources/parking/proyecto.datasource.postgres";
import { TicketPostgresDatasource } from "../../infrastructure/datasources/parking/ticket.datasource.postgres";
import { CashPaymentSessionPostgresDatasource } from "../../infrastructure/datasources/payments/cash-payment-session.datasource.postgres";
import { CashTicketPaymentPostgresDatasource } from "../../infrastructure/datasources/payments/cash-ticket-payment.datasource.postgres";
import { PaymentPostgresDatasource } from "../../infrastructure/datasources/payments/payment.datasource.postgres";
import { PensionMovePostgresDatasource } from "../../infrastructure/datasources/pension/pension-move.datasource.postgres";
import { PensionPassPostgresDatasource } from "../../infrastructure/datasources/pension/pension-pass.datasource.postgres";
import { PensionPostgresDatasource } from "../../infrastructure/datasources/pension/pension.datasource.postgres";
import { SyncPostgresDatasource } from "../../infrastructure/datasources/sync/sync.datasource.postgres";
import { HealthPostgresDatasource } from "../../infrastructure/datasources/system/health.datasource.postgres";
import { MonthlyFlushPostgresDatasource } from "../../infrastructure/datasources/system/monthly-flush.datasource.postgres";
import { OperationalLogPostgresDatasource } from "../../infrastructure/datasources/system/operational-log.datasource.postgres";
import { OutboxPostgresDatasource } from "../../infrastructure/datasources/system/outbox.datasource.postgres";
import { PostgresTransactionRunner } from "../../infrastructure/datasources/system/transaction-runner.postgres";
import { AuthRepositoryImpl } from "../../infrastructure/repositories/auth/auth.repository.impl";
import { PermissionProfileRepositoryImpl } from "../../infrastructure/repositories/auth/permission-profile.repository.impl";
import { CashRegisterCountRepositoryImpl } from "../../infrastructure/repositories/cash-register/cash-register-count.repository.impl";
import { CashRegisterCutRepositoryImpl } from "../../infrastructure/repositories/cash-register/cash-register-cut.repository.impl";
import { CashRegisterModuleRepositoryImpl } from "../../infrastructure/repositories/cash-register/cash-register-module.repository.impl";
import { CashRegisterMovementRepositoryImpl } from "../../infrastructure/repositories/cash-register/cash-register-movement.repository.impl";
import { CashRegisterShiftRepositoryImpl } from "../../infrastructure/repositories/cash-register/cash-register-shift.repository.impl";
import { ConfigSyncRepositoryImpl } from "../../infrastructure/repositories/config/config-sync.repository.impl";
import { LocalInstallationRepositoryImpl } from "../../infrastructure/repositories/installation/local-installation.repository.impl";
import { LocalReportsRepositoryImpl } from "../../infrastructure/repositories/local-reports/local-reports.repository.impl";
import { MobileCommandRepositoryImpl } from "../../infrastructure/repositories/mobile/mobile-command.repository.impl";
import { ModuloRepositoryImpl } from "../../infrastructure/repositories/parking/modulo.repository.impl";
import { ProyectoRepositoryImpl } from "../../infrastructure/repositories/parking/proyecto.repository.impl";
import { TicketRepositoryImpl } from "../../infrastructure/repositories/parking/ticket.repository.impl";
import { CashPaymentSessionRepositoryImpl } from "../../infrastructure/repositories/payments/cash-payment-session.repository.impl";
import { CashTicketPaymentRepositoryImpl } from "../../infrastructure/repositories/payments/cash-ticket-payment.repository.impl";
import { PaymentRepositoryImpl } from "../../infrastructure/repositories/payments/payment.repository.impl";
import { PensionMoveRepositoryImpl } from "../../infrastructure/repositories/pension/pension-move.repository.impl";
import { PensionPassRepositoryImpl } from "../../infrastructure/repositories/pension/pension-pass.repository.impl";
import { PensionRepositoryImpl } from "../../infrastructure/repositories/pension/pension.repository.impl";
import { SyncRepositoryImpl } from "../../infrastructure/repositories/sync/sync.repository.impl";
import { HealthRepositoryImpl } from "../../infrastructure/repositories/system/health.repository.impl";
import { MonthlyFlushRepositoryImpl } from "../../infrastructure/repositories/system/monthly-flush.repository.impl";
import { OperationalLogRepositoryImpl } from "../../infrastructure/repositories/system/operational-log.repository.impl";
import { OutboxRepositoryImpl } from "../../infrastructure/repositories/system/outbox.repository.impl";

/** Runs a unit of work in one database transaction. */
export const buildTransactionRunner = () => new PostgresTransactionRunner();
/** Longer limit for the configuration sync, which may write hundreds of rows. */
export const buildSyncTransactionRunner = () => new PostgresTransactionRunner({ timeoutMs: 60_000, maxWaitMs: 10_000 });

export const buildAuthRepository = () => new AuthRepositoryImpl(new AuthPostgresDatasource());
export const buildPermissionProfileRepository = () =>
  new PermissionProfileRepositoryImpl(new PermissionProfilePostgresDatasource());

export const buildProyectoRepository = () => new ProyectoRepositoryImpl(new ProyectoPostgresDatasource());
export const buildModuloRepository = () => new ModuloRepositoryImpl(new ModuloPostgresDatasource());
export const buildTicketRepository = () => new TicketRepositoryImpl(new TicketPostgresDatasource());

export const buildPensionRepository = () => new PensionRepositoryImpl(new PensionPostgresDatasource());
export const buildPensionPassRepository = () => new PensionPassRepositoryImpl(new PensionPassPostgresDatasource());
export const buildPensionMoveRepository = () => new PensionMoveRepositoryImpl(new PensionMovePostgresDatasource());

export const buildPaymentRepository = () => new PaymentRepositoryImpl(new PaymentPostgresDatasource());
export const buildCashPaymentSessionRepository = () =>
  new CashPaymentSessionRepositoryImpl(new CashPaymentSessionPostgresDatasource());
export const buildCashTicketPaymentRepository = () =>
  new CashTicketPaymentRepositoryImpl(new CashTicketPaymentPostgresDatasource());

export const buildCashRegisterShiftRepository = () =>
  new CashRegisterShiftRepositoryImpl(new CashRegisterShiftPostgresDatasource());
export const buildCashRegisterMovementRepository = () =>
  new CashRegisterMovementRepositoryImpl(new CashRegisterMovementPostgresDatasource());
export const buildCashRegisterCountRepository = () =>
  new CashRegisterCountRepositoryImpl(new CashRegisterCountPostgresDatasource());
export const buildCashRegisterCutRepository = () => new CashRegisterCutRepositoryImpl(new CashRegisterCutPostgresDatasource());
export const buildCashRegisterModuleRepository = () =>
  new CashRegisterModuleRepositoryImpl(new CashRegisterModulePostgresDatasource());

export const buildLocalInstallationRepository = () =>
  new LocalInstallationRepositoryImpl(new LocalInstallationPostgresDatasource());
export const buildSyncRepository = () => new SyncRepositoryImpl(new SyncPostgresDatasource());
export const buildConfigSyncRepository = () => new ConfigSyncRepositoryImpl(new ConfigSyncPostgresDatasource());
export const buildMobileCommandRepository = () => new MobileCommandRepositoryImpl(new MobileCommandPostgresDatasource());
export const buildLocalReportsRepository = () => new LocalReportsRepositoryImpl(new LocalReportsPostgresDatasource());

export const buildHealthRepository = () => new HealthRepositoryImpl(new HealthPostgresDatasource());
export const buildOperationalLogRepository = () => new OperationalLogRepositoryImpl(new OperationalLogPostgresDatasource());
export const buildMonthlyFlushRepository = () => new MonthlyFlushRepositoryImpl(new MonthlyFlushPostgresDatasource());
export const buildOutboxRepository = () => new OutboxRepositoryImpl(new OutboxPostgresDatasource());
