import { describe, expect, it } from "vitest";
import type { SyncLog } from "../types/integration/sync-log";
import { getStatusLabel } from "../utils/syncStatusLabel";

function log(overrides: Partial<SyncLog>): SyncLog {
  return {
    id: 1,
    status: "success",
    records_added: 0,
    error: null,
    started_at: "2026-01-01T00:00:00Z",
    completed_at: null,
    cancelled_at: null,
    total_items: 0,
    emails_total: 0,
    emails_done: 0,
    emails_fetched: 0,
    gmail_matches_total: 0,
    ...overrides,
  };
}

describe("getStatusLabel", () => {
  it("shows progress while running", () => {
    expect(getStatusLabel(log({ status: "running", emails_total: 20, emails_fetched: 8, emails_done: 5 }))).toBe("Syncing… 8 of 20 fetched, 5 extracted");
  });

  it("counts documents added, with the right plural", () => {
    expect(getStatusLabel(log({ records_added: 1 }))).toBe("1 document added");
    expect(getStatusLabel(log({ records_added: 3 }))).toBe("3 documents added");
    expect(getStatusLabel(log({ records_added: null }))).toBe("0 documents added");
  });

  it("says a partial sync had failures", () => {
    expect(getStatusLabel(log({ status: "partial", records_added: 2 }))).toBe("Partial — 2 documents added, some items failed");
  });

  it("says what was added before a cancel, or just cancelled", () => {
    expect(getStatusLabel(log({ status: "cancelled", records_added: 1 }))).toBe("Cancelled — 1 document added before cancellation");
    expect(getStatusLabel(log({ status: "cancelled", records_added: 0 }))).toBe("Cancelled");
  });

  it("says failed", () => {
    expect(getStatusLabel(log({ status: "failed" }))).toBe("Failed");
  });
});
