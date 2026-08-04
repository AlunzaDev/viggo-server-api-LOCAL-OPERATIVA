import { CustomError } from "../../../domain/errors/custom.error";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LOG_RANGE_MS = DAY_MS;
const MAX_LOG_RANGE_MS = DAY_MS * 31;
const MAX_SUMMARY_MESSAGE_LENGTH = 180;

export const parsePositiveInteger = (
  value: unknown,
  fallback: number,
  max?: number,
) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  if (max && parsed > max) return max;
  return Math.floor(parsed);
};

export const parseOptionalTimestamp = (
  value: unknown,
  label: string,
): number | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw CustomError.badRequest(`El parametro '${label}' debe ser numerico`);
  }
  return parsed;
};

export const parseStrictEnum = <T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): T | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw CustomError.badRequest(`El parametro '${label}' no es valido`);
  }

  const normalized = value.trim() as T;
  if (!allowed.includes(normalized)) {
    throw CustomError.badRequest(
      `El parametro '${label}' no es valido`,
      { allowedValues: allowed, received: value },
      "INVALID_QUERY_ENUM",
    );
  }

  return normalized;
};

export const normalizeLogRange = (input: {
  from?: number;
  to?: number;
  now?: number;
}) => {
  const now = Number.isFinite(input.now) ? Number(input.now) : Date.now();
  const resolvedFrom = input.from ?? now - DEFAULT_LOG_RANGE_MS;
  const resolvedTo = input.to ?? now;
  const from = Math.min(resolvedFrom, resolvedTo);
  const to = Math.max(resolvedFrom, resolvedTo);

  if (to - from > MAX_LOG_RANGE_MS) {
    throw CustomError.badRequest(
      "El rango solicitado es demasiado grande",
      { maxRangeMs: MAX_LOG_RANGE_MS, from, to },
      "LOG_RANGE_TOO_LARGE",
    );
  }

  return { from, to };
};

export const normalizeFlushSummaryMessage = (
  message: unknown,
  fallbackTotalLogs: number,
): string => {
  const normalized = String(message ?? "")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return fallbackTotalLogs > 1
      ? `${fallbackTotalLogs} movimientos registrados`
      : "Movimiento operativo registrado";
  }

  if (normalized.length <= MAX_SUMMARY_MESSAGE_LENGTH) {
    return normalized;
  }

  return `${normalized.slice(0, MAX_SUMMARY_MESSAGE_LENGTH - 1).trim()}…`;
};
