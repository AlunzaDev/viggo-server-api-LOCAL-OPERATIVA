import { envs } from "../../../config";
import type { OutboxEvent } from "../../../domain/datasources/system/outbox.datasource";
import { OutboxRepository } from "../../../domain/repositories/system/outbox.repository";
import { InstallationTokenCryptoService } from "../installation/installation-token-crypto.service";
import { LocalInstallationService } from "../installation/local-installation.service";

/** Prefix of lastError for events the cloud refused: they do not hold the queue. */
const REJECTED = "rejected: ";

export interface OutboxPublisherOptions {
  batchSize?: number;
  /** First retry delay after a connection failure; doubles each attempt. */
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Retry delay for an event the cloud refused (validation error). */
  rejectedDelayMs?: number;
}

export interface OutboxPublishResult {
  sent: number;
  rejected: number;
  /** True when delivery stopped early (no link, cloud unreachable, waiting to retry). */
  stopped: boolean;
  reason?: "NOT_LINKED" | "UNREACHABLE" | "BACKOFF";
  /** Events looked at in this batch. */
  processed: number;
}

type Delivery = { outcome: "sent" } | { outcome: "retry" | "rejected"; error: string };

/**
 * Sends the outbox to ADMINISTRATIVO in order. While the cloud is unreachable the head
 * of the queue waits (exponential backoff, retried forever), so nothing is lost or
 * reordered; the cloud ignores events it already has (same eventId), which makes a
 * resend after a crash harmless.
 */
export class OutboxPublisherService {
  private readonly batchSize: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly rejectedDelayMs: number;

  constructor(
    private readonly outbox: OutboxRepository,
    private readonly installations: LocalInstallationService,
    options: OutboxPublisherOptions = {},
  ) {
    this.batchSize = options.batchSize ?? 50;
    this.baseDelayMs = options.baseDelayMs ?? 1_000;
    this.maxDelayMs = options.maxDelayMs ?? 5 * 60_000;
    this.rejectedDelayMs = options.rejectedDelayMs ?? 60 * 60_000;
  }

  async publishPending(now = Date.now()): Promise<OutboxPublishResult> {
    const result: OutboxPublishResult = { sent: 0, rejected: 0, stopped: false, processed: 0 };
    const installation = await this.installations.findDefault();
    const proyectoId = String(installation?.proyectoId ?? "").trim();
    if (installation?.status !== "linked" || !proyectoId) {
      return { ...result, stopped: true, reason: "NOT_LINKED" };
    }
    const headers = this.headers(installation);

    for (const event of await this.outbox.nextBatch(this.batchSize)) {
      result.processed += 1;
      if (event.nextAttemptAt > now) {
        if (event.lastError.startsWith(REJECTED)) continue;
        return { ...result, stopped: true, reason: "BACKOFF" };
      }

      const delivery = await this.deliver(event, proyectoId, headers);
      if (delivery.outcome === "sent") {
        await this.outbox.markSent(event.eventId, Date.now());
        result.sent += 1;
      } else if (delivery.outcome === "rejected") {
        await this.outbox.markFailed(event.eventId, `${REJECTED}${delivery.error}`, now + this.rejectedDelayMs);
        result.rejected += 1;
      } else {
        await this.outbox.markFailed(event.eventId, delivery.error, now + this.retryDelay(event.attempts + 1));
        return { ...result, stopped: true, reason: "UNREACHABLE" };
      }
    }
    return result;
  }

  stats() {
    return this.outbox.stats();
  }

  private retryDelay(attempts: number) {
    return Math.min(this.maxDelayMs, this.baseDelayMs * 2 ** Math.max(0, attempts - 1));
  }

  private headers(installation: Record<string, unknown>) {
    const encrypted = String(installation.encryptedSyncToken ?? "").trim();
    const token = encrypted ? InstallationTokenCryptoService.decrypt(encrypted) : envs.SYNC_SERVICE_TOKEN;
    return {
      Authorization: `Bearer ${token}`,
      "X-Viggo-Installation-Id": String(installation.installationId ?? "").trim() || envs.INSTALLATION_ID,
      "Content-Type": "application/json",
    };
  }

  private async deliver(event: OutboxEvent, proyectoId: string, headers: Record<string, string>): Promise<Delivery> {
    let response: Response;
    try {
      response = await fetch(`${envs.ADMINISTRATIVO_API_URL.replace(/\/+$/, "")}/api/sync/events`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          eventId: event.eventId,
          proyectoId,
          eventType: event.eventType,
          aggregateId: event.aggregateId,
          occurredAt: event.occurredAt,
          payload: event.payload,
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      return { outcome: "retry", error: error instanceof Error ? error.message : "Sin conexion con la nube" };
    }

    if (response.ok) return { outcome: "sent" };
    const body = (await response.json().catch(() => ({}))) as { error?: unknown };
    const error = `HTTP ${response.status}${body.error ? `: ${String(body.error)}` : ""}`;
    // Auth, timeouts, rate limits and server errors are temporary: keep the order and retry.
    const temporary = response.status >= 500 || [401, 403, 408, 429].includes(response.status);
    return { outcome: temporary ? "retry" : "rejected", error };
  }
}
