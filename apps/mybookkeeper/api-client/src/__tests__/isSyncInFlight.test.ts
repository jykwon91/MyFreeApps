import { describe, expect, it } from "vitest";
import type { EmailQueueItem } from "../types/integration/email-queue-item";
import type { SyncLog } from "../types/integration/sync-log";
import { isSyncInFlight } from "../utils/isSyncInFlight";

const log = (status: SyncLog["status"]): SyncLog => ({
  id: 1, status, records_added: 0, error: null, started_at: "2026-11-01T12:00:00Z", completed_at: null, cancelled_at: null,
  total_items: 0, emails_total: 0, emails_done: 0, emails_fetched: 0, gmail_matches_total: 0,
});
const item = (status: EmailQueueItem["status"]): EmailQueueItem => ({ id: "q", sync_log_id: 1, attachment_filename: null, email_subject: null, status, error: null, created_at: null });

describe("isSyncInFlight", () => {
  it("is while a sync is running", () => {
    expect(isSyncInFlight([log("running")], [])).toBe(true);
  });

  it.each(["pending", "fetched", "extracting"] as const)("is while an email is %s", (status) => {
    expect(isSyncInFlight(undefined, [item(status)])).toBe(true);
  });

  it("isn't once everything is finished or failed, or before anything has loaded", () => {
    expect(isSyncInFlight([log("success"), log("failed")], [item("done"), item("skipped"), item("failed")])).toBe(false);
    expect(isSyncInFlight(undefined, undefined)).toBe(false);
  });
});
