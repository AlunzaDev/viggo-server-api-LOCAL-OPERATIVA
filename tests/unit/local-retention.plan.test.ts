import { describe, expect, it } from "vitest";
import { localRetentionPlan } from "../../src/presentation/services/retention/local-retention.scheduler";

describe("localRetentionPlan", () => {
  it("purges cash shifts and sessions before tickets: a payment session keeps its ticket", () => {
    const targets = localRetentionPlan({ operation: 180, audit: 90, commandReceipts: 30 }).map((rule) => rule.target);
    expect(targets.indexOf("cash_shifts")).toBeLessThan(targets.indexOf("tickets"));
    expect(targets.indexOf("cash_payment_sessions")).toBeLessThan(targets.indexOf("tickets"));
  });

  it("skips what is set to 0 days", () => {
    expect(localRetentionPlan({ operation: 0, audit: 90, commandReceipts: 0 }).map((rule) => rule.target)).toEqual(["config_sync_audits", "binding_requests"]);
  });
});
