import { describe, it, expect } from "vitest";
import { defaultPermissionsForRole } from "@/lib/access-control/roles";
import { dedupeCafeEvents, createSequenceTracker } from "@/lib/realtime/cafe-events";

describe("café realtime client semantics (unit)", () => {
  it("deduplicates redelivered events by eventId (idempotent deltas)", () => {
    const dedupe = dedupeCafeEvents();
    expect(dedupe.isDuplicate("evt-1")).toBe(false);
    expect(dedupe.accept("evt-1")).toBe(true);
    // Second delivery of the same event is dropped.
    expect(dedupe.accept("evt-1")).toBe(false);
    expect(dedupe.isDuplicate("evt-1")).toBe(true);
    // A distinct event still passes.
    expect(dedupe.accept("evt-2")).toBe(true);
  });

  it("tracks the highest sequence (resume marker) monotonically", () => {
    const tracker = createSequenceTracker(0);
    tracker.advance(5);
    tracker.advance(3); // out-of-order lower value ignored
    tracker.advance(9);
    expect(tracker.latest).toBe(9);
  });
});

describe("café role permission matrix (granted)", () => {
  it("BARISTA holds the KDS minimum (view + status + read) and no accounting/inventory", () => {
    const perms: ReadonlySet<string> = new Set(defaultPermissionsForRole("BARISTA"));
    for (const p of ["cafe.kds.view", "cafe.orders.status", "cafe.orders.read"]) {
      expect(perms.has(p), p).toBe(true);
    }
    // BARISTA must NOT create orders or hold accounting/supplier/user powers.
    for (const denied of [
      "cafe.orders.create",
      "cafe.orders.cancel",
      "expenses.create",
      "accounting.read",
      "suppliers.read",
      "inventory.adjust",
      "users.read",
    ]) {
      expect(perms.has(denied), denied).toBe(false);
    }
  });

  it("CASHIER can read/create/update/cancel but not advance status or view KDS", () => {
    const perms: ReadonlySet<string> = new Set(defaultPermissionsForRole("CASHIER"));
    for (const allowed of ["cafe.orders.read", "cafe.orders.create", "cafe.orders.update", "cafe.orders.cancel"]) {
      expect(perms.has(allowed), allowed).toBe(true);
    }
    for (const denied of ["cafe.orders.status", "cafe.kds.view"]) {
      expect(perms.has(denied), denied).toBe(false);
    }
  });

  it("MANAGER holds every café permission; OWNER holds all via PERMISSIONS", async () => {
    const managerPerms: ReadonlySet<string> = new Set(defaultPermissionsForRole("MANAGER"));
    for (const p of [
      "cafe.orders.read",
      "cafe.orders.create",
      "cafe.orders.update",
      "cafe.orders.cancel",
      "cafe.orders.status",
      "cafe.kds.view",
    ]) {
      expect(managerPerms.has(p), p).toBe(true);
    }
    const { PERMISSIONS } = await import("@/lib/access-control/permissions");
    for (const p of [
      "cafe.orders.read",
      "cafe.orders.create",
      "cafe.orders.update",
      "cafe.orders.cancel",
      "cafe.orders.status",
      "cafe.kds.view",
    ]) {
      expect((PERMISSIONS as readonly string[]).includes(p), p).toBe(true);
    }
  });
});
