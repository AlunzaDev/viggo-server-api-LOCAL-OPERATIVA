import type { LogEntity } from "../entities";

export interface LogRepository {
    saveLog(log: LogEntity): void | Promise<void>;
}

export * from "./parking/proyecto.repository";
export * from "./parking/modulo.repository";
export * from "./parking/ticket.repository";
export * from "./pension/pension.repository";
export * from "./pension/pension-pass.repository";
export * from "./pension/pension-move.repository";
export * from "./auth/auth.repository";
export * from "./auth/permission-profile.repository";
export * from "./auth/usuario.repository";
export * from "./cash-register/cash-register-shift.repository";
export * from "./cash-register/cash-register-movement.repository";
export * from "./cash-register/cash-register-count.repository";
export * from "./cash-register/cash-register-cut.repository";
export * from "./payments/payment.repository";
export * from "./payments/cash-payment-session.repository";
export * from "./payments/cash-ticket-payment.repository";
export * from "./installation/local-installation.repository";
export * from "./sync/sync.repository";
export * from "./local-reports/local-reports.repository";
export * from "./cash-register/cash-register-module.repository";
