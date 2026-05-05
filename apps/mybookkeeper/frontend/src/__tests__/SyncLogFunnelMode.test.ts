import { describe, it, expect } from "vitest";
import { useSyncLogFunnelMode } from "@/app/features/integrations/useSyncLogFunnelMode";
import type { SyncLog } from "@/shared/types/integration/sync-log";

function makeLog(overrides: Partial<SyncLog> = {}): SyncLog {
  return {
    id: 1,
    status: "success",
    records_added: 0,
    error: null,
    started_at: "2024-01-01T00:00:00Z",
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

describe("useSyncLogFunnelMode", () => {
  it("returns modern when gmail_matches_total > 0", () => {
    expect(useSyncLogFunnelMode(makeLog({ gmail_matches_total: 10 }))).toBe("modern");
  });

  it("returns legacy when gmail_matches_total is 0 but emails_total > 0", () => {
    expect(useSyncLogFunnelMode(makeLog({ gmail_matches_total: 0, emails_total: 5 }))).toBe("legacy");
  });

  it("returns none when both gmail_matches_total and emails_total are 0", () => {
    expect(useSyncLogFunnelMode(makeLog({ gmail_matches_total: 0, emails_total: 0 }))).toBe("none");
  });

  it("prefers modern over legacy when both are > 0", () => {
    expect(useSyncLogFunnelMode(makeLog({ gmail_matches_total: 10, emails_total: 5 }))).toBe("modern");
  });
});
