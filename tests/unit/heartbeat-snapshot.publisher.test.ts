import { describe, expect, it } from "vitest";
import { HeartbeatSnapshotPublisher } from "../../src/presentation/services/heartbeat/heartbeat-snapshot.publisher";

// LOCAL-OPERATIVA#27: module states reach ADMIN when they change (batched) and once a minute.
const setup = (result: () => boolean | Promise<boolean> = () => true) => {
  const clock = { now: 1_000_000 };
  const sent: string[] = [];
  const publisher = new HeartbeatSnapshotPublisher({ batchMs: 3_000, keepaliveMs: 60_000, retryMs: 10_000, now: () => clock.now });
  publisher.useSender(async (proyectoId) => {
    sent.push(proyectoId);
    return result();
  });
  const advance = async (ms: number) => {
    clock.now += ms;
    await publisher.tick();
  };
  return { clock, sent, publisher, advance };
};

const online = (now: number) => ({ isConnected: true, isAuthorized: true, connectionStatus: "CONNECTED", lastHeartbeatAt: new Date(now) });
const offline = { isConnected: false, isAuthorized: true, connectionStatus: "DISCONNECTED", lastHeartbeatAt: null };

describe("HeartbeatSnapshotPublisher", () => {
  it("sends a watched project right away, then once a minute without changes", async () => {
    const { sent, publisher, advance } = setup();
    publisher.watch("p1");
    await advance(0);
    expect(sent).toEqual(["p1"]);
    await advance(59_000);
    expect(sent).toHaveLength(1);
    await advance(1_000);
    expect(sent).toEqual(["p1", "p1"]);
  });

  it("batches status changes of several modules into one send", async () => {
    const { clock, sent, publisher, advance } = setup();
    publisher.watch("p1");
    await advance(0);
    publisher.moduleUpdated({ id: "m1", proyecto: "p1", deviceRuntime: online(clock.now) });
    publisher.moduleUpdated({ id: "m2", proyecto: "p1", deviceRuntime: online(clock.now) });
    await advance(2_000);
    expect(sent).toHaveLength(1);
    await advance(1_000);
    expect(sent).toEqual(["p1", "p1"]);
  });

  it("does not send plain heartbeats that keep the same status", async () => {
    const { clock, sent, publisher, advance } = setup();
    publisher.moduleUpdated({ id: "m1", proyecto: "p1", deviceRuntime: online(clock.now) });
    await advance(3_000);
    expect(sent).toHaveLength(1);
    // A device heartbeat every 20 s: still online, nothing new to tell.
    for (let i = 0; i < 2; i++) {
      await advance(20_000);
      publisher.moduleUpdated({ id: "m1", proyecto: "p1", deviceRuntime: online(clock.now) });
      await advance(0);
    }
    expect(sent).toHaveLength(1);
  });

  it("sends a status change after the batch window", async () => {
    const { clock, sent, publisher, advance } = setup();
    publisher.moduleUpdated({ id: "m1", proyecto: "p1", deviceRuntime: online(clock.now) });
    await advance(3_000);
    publisher.moduleUpdated({ id: "m1", proyecto: "p1", deviceRuntime: offline });
    await advance(3_000);
    expect(sent).toEqual(["p1", "p1"]);
  });

  it("always sends forced changes, such as a binding decision", async () => {
    const { clock, sent, publisher, advance } = setup();
    publisher.moduleUpdated({ id: "m1", proyecto: "p1", deviceRuntime: online(clock.now) });
    await advance(3_000);
    publisher.moduleUpdated({ id: "m1", proyecto: "p1", deviceRuntime: online(clock.now) }, true);
    await advance(3_000);
    expect(sent).toHaveLength(2);
  });

  it("retries a failed send after the retry delay, not every tick", async () => {
    let ok = false;
    const { sent, publisher, advance } = setup(() => ok);
    publisher.watch("p1");
    await advance(0);
    await advance(1_000);
    await advance(5_000);
    expect(sent).toHaveLength(1);
    ok = true;
    await advance(4_000);
    expect(sent).toHaveLength(2);
    await advance(30_000);
    expect(sent).toHaveLength(2);
  });

  it("counts a thrown error as a failed send", async () => {
    const { sent, publisher, advance } = setup(() => { throw new Error("network"); });
    publisher.watch("p1");
    await advance(0);
    await advance(9_000);
    expect(sent).toHaveLength(1);
    await advance(1_000);
    expect(sent).toHaveLength(2);
  });

  it("never sends the same project twice at once; a change during a send goes out later", async () => {
    let release: (ok: boolean) => void = () => undefined;
    let calls = 0;
    // Only the first send hangs until released; later ones answer at once.
    const { clock, sent, publisher, advance } = setup(() => (++calls === 1 ? new Promise<boolean>((resolve) => { release = resolve; }) : true));
    publisher.watch("p1");
    const first = advance(0);
    publisher.moduleUpdated({ id: "m1", proyecto: "p1", deviceRuntime: online(clock.now) });
    clock.now += 3_000;
    await publisher.tick();
    expect(sent).toHaveLength(1);
    release(true);
    await first;
    await advance(0);
    expect(sent).toHaveLength(2);
  });

  it("keeps the first sender and ignores modules without a project", async () => {
    const { sent, publisher, advance } = setup();
    publisher.useSender(async () => { throw new Error("second sender must not be used"); });
    publisher.moduleUpdated({ id: "m1", proyecto: "", deviceRuntime: null });
    publisher.watch("p2");
    await advance(0);
    expect(sent).toEqual(["p2"]);
  });

  it("starts and stops its timer", () => {
    const publisher = new HeartbeatSnapshotPublisher({ tickMs: 60_000 });
    publisher.start();
    publisher.start();
    publisher.stop();
    publisher.stop();
  });
});
