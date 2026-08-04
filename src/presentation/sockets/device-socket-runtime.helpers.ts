import type { OpenBarrierResponse } from "./device-socket.types";

const DEFAULT_BARRIER_ERROR = "El dispositivo no confirmo la apertura de barrera";

export const normalizeOpenBarrierResponse = (
  response: unknown,
): OpenBarrierResponse => {
  const candidate = Array.isArray(response) ? response[0] : response;

  if (!candidate || typeof candidate !== "object") {
    return { ok: true };
  }

  const record = candidate as Record<string, unknown>;
  const okValue = record.ok;
  const codeValue = typeof record.code === "string" ? record.code.trim() : "";
  const errorValue =
    typeof record.error === "string"
      ? record.error.trim()
      : typeof record.message === "string"
        ? record.message.trim()
        : "";
  const deviceSecretValue =
    typeof record.deviceSecret === "string" ? record.deviceSecret : undefined;

  if (okValue === false) {
    return {
      ok: false,
      error: errorValue || DEFAULT_BARRIER_ERROR,
      code: codeValue || undefined,
      deviceSecret: deviceSecretValue,
    };
  }

  if (okValue === true) {
    return {
      ok: true,
      error: errorValue || undefined,
      code: codeValue || undefined,
      deviceSecret: deviceSecretValue,
    };
  }

  if (errorValue) {
    return {
      ok: false,
      error: errorValue,
      code: codeValue || undefined,
      deviceSecret: deviceSecretValue,
    };
  }

  return {
    ok: true,
    code: codeValue || undefined,
    deviceSecret: deviceSecretValue,
  };
};
