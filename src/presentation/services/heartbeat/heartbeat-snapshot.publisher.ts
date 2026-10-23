import { resolveHeartbeatStatus, type DeviceRuntimeState, type HeartbeatStatus } from "@alunzadev/viggo-contracts";

/** Sends one project's heartbeat snapshot to ADMINISTRATIVO; true when it was accepted. */
export type SnapshotSender = (proyectoId: string) => Promise<boolean>;

export type HeartbeatSnapshotPublisherOptions = {
  /** Changes within this window go out together. */
  batchMs: number;
  /** Without changes, a snapshot still goes out this often, so ADMIN knows the data is current. */
  keepaliveMs: number;
  /** After a failed send, the next try. */
  retryMs: number;
  /** How often pending sends are checked. */
  tickMs: number;
  now: () => number;
};

type ProjectState = {
  /** When the next send is due because something changed; null when nothing is pending. */
  dueAt: number | null;
  lastSentAt: number;
  /** After a failed send, nothing goes out before this. */
  retryAt: number;
  sending: boolean;
};

type UpdatedModule = { id: string; proyecto: string; deviceRuntime?: DeviceRuntimeState | null };

const DEFAULTS: HeartbeatSnapshotPublisherOptions = {
  batchMs: 3_000,
  keepaliveMs: 60_000,
  retryMs: 10_000,
  tickMs: 1_000,
  now: () => Date.now(),
};

/**
 * Decides when OPERATIVO tells ADMINISTRATIVO the state of its modules (LOCAL-OPERATIVA#27).
 * Every device heartbeat used to send the whole project (about 30 sends a minute with 10
 * modules); now a status change goes out after a short batch, and otherwise once a minute.
 * One instance is shared: several ModuloService objects report to it.
 */
export class HeartbeatSnapshotPublisher {
  static readonly shared = new HeartbeatSnapshotPublisher();

  private readonly options: HeartbeatSnapshotPublisherOptions;
  private readonly projects = new Map<string, ProjectState>();
  private readonly statuses = new Map<string, HeartbeatStatus>();
  private sender: SnapshotSender | null = null;
  private ticker: ReturnType<typeof setInterval> | null = null;

  constructor(options: Partial<HeartbeatSnapshotPublisherOptions> = {}) {
    this.options = { ...DEFAULTS, ...options };
  }

  /** Who sends the snapshots; the first one given is kept (they all send the same). */
  useSender(sender: SnapshotSender) {
    this.sender ??= sender;
  }

  /** Keeps a project's snapshot going even before any of its modules reports. */
  watch(proyectoId: string) {
    if (proyectoId) this.project(proyectoId);
  }

  /**
   * A module was updated. Its project is sent soon when the module's heartbeat status changed,
   * or always when `force` (a binding or configuration change); a plain heartbeat waits for
   * the once-a-minute send.
   */
  moduleUpdated(modulo: UpdatedModule, force = false) {
    if (!modulo.proyecto) return;
    const status = resolveHeartbeatStatus(modulo.deviceRuntime, this.options.now());
    const changed = force || this.statuses.get(modulo.id) !== status;
    this.statuses.set(modulo.id, status);
    if (changed) this.due(this.project(modulo.proyecto), this.options.now() + this.options.batchMs);
  }

  start() {
    if (this.ticker) return;
    this.ticker = setInterval(() => void this.tick(), this.options.tickMs);
    this.ticker.unref?.();
  }

  stop() {
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
  }

  /** Sends what is due; returns when those sends finish (tests call it directly). */
  async tick() {
    const now = this.options.now();
    const sends: Promise<void>[] = [];
    for (const [proyectoId, state] of this.projects) {
      if (state.sending || now < state.retryAt) continue;
      const changed = state.dueAt !== null && now >= state.dueAt;
      const stale = now - state.lastSentAt >= this.options.keepaliveMs;
      if (changed || stale) sends.push(this.send(proyectoId, state));
    }
    await Promise.all(sends);
  }

  private async send(proyectoId: string, state: ProjectState) {
    if (!this.sender) return;
    state.sending = true;
    state.dueAt = null;
    let ok = false;
    try {
      ok = await this.sender(proyectoId);
    } catch {
      ok = false;
    } finally {
      state.sending = false;
    }
    // A change that arrived while sending keeps its own due time and goes out on a later tick.
    const now = this.options.now();
    if (ok) {
      state.lastSentAt = now;
      state.retryAt = 0;
    } else {
      state.retryAt = now + this.options.retryMs;
      this.due(state, state.retryAt);
    }
  }

  private due(state: ProjectState, at: number) {
    state.dueAt = state.dueAt === null ? at : Math.min(state.dueAt, at);
  }

  private project(proyectoId: string): ProjectState {
    let state = this.projects.get(proyectoId);
    if (!state) {
      state = { dueAt: null, lastSentAt: 0, retryAt: 0, sending: false };
      this.projects.set(proyectoId, state);
    }
    return state;
  }
}
