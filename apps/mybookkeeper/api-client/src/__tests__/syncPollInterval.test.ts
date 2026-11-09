import { describe, expect, it } from "vitest";
import { SYNC_ACTIVE_POLL_INTERVAL_MS, SYNC_IDLE_POLL_INTERVAL_MS } from "../constants/syncPolling";
import type { EmailQueueItem } from "../types/integration/email-queue-item";
import type { SyncLog } from "../types/integration/sync-log";
import { syncPollInterval } from "../utils/syncPollInterval";

const log = (status: SyncLog["status"]): SyncLog => ({
  id: 1, status, records_added: 0, error: null, started_at: "2026-11-01T12:00:00Z", completed_at: null, cancelled_at: null,
  total_items: 0, emails_total: 0, emails_done: 0, emails_fetched: 0, gmail_matches_total: 0,
});
const item = (status: EmailQueueItem["status"]): EmailQueueItem => ({ id: "q", sync_log_id: 1, attachment_filename: null, email_subject: null, status, error: null, created_at: null });

describe("syncPollInterval", () => {
  it("polls fast while a sync is running", () => {
    expect(syncPollInterval([log("running")], [])).toBe(SYNC_ACTIVE_POLL_INTERVAL_MS);
  });

  it.each(["pending", "fetched", "extracting"] as const)("polls fast while an email is %s", (status) => {
    expect(syncPollInterval([log("success")], [item(status)])).toBe(SYNC_ACTIVE_POLL_INTERVAL_MS);
  });

  it("polls slowly when everything is finished or failed", () => {
    expect(syncPollInterval([log("success"), log("failed")], [item("done"), item("skipped"), item("failed")])).toBe(SYNC_IDLE_POLL_INTERVAL_MS);
  });

  it("polls slowly before anything has loaded", () => {
    expect(syncPollInterval(undefined, undefined)).toBe(SYNC_IDLE_POLL_INTERVAL_MS);
  });
});
