import { describe, expect, it } from "vitest";
import { SYNC_ACTIVE_POLL_INTERVAL_MS, SYNC_IDLE_POLL_INTERVAL_MS } from "../constants/syncPolling";
import type { EmailQueueItem } from "../types/integration/email-queue-item";
import type { GmailSyncWatchOptions } from "../types/integration/gmail-sync-watch-options";
import { gmailWatchPollInterval } from "../utils/gmailWatchPollInterval";

const item = (status: EmailQueueItem["status"]): EmailQueueItem => ({ id: "q", sync_log_id: 1, attachment_filename: null, email_subject: null, status, error: null, created_at: null });
const web: GmailSyncWatchOptions = { skip: false, canPoll: true, pollWhileIdle: true };
const phone: GmailSyncWatchOptions = { skip: false, canPoll: true, pollWhileIdle: false };

describe("gmailWatchPollInterval", () => {
  it.each(["pending", "fetched", "extracting"] as const)("polls fast while an email is %s", (status) => {
    expect(gmailWatchPollInterval([item(status)], web)).toBe(SYNC_ACTIVE_POLL_INTERVAL_MS);
    expect(gmailWatchPollInterval([item(status)], phone)).toBe(SYNC_ACTIVE_POLL_INTERVAL_MS);
  });

  it("polls slowly when idle only where asked to", () => {
    const settled = [item("done"), item("skipped"), item("failed")];
    expect(gmailWatchPollInterval(settled, web)).toBe(SYNC_IDLE_POLL_INTERVAL_MS);
    expect(gmailWatchPollInterval(settled, phone)).toBe(0);
    expect(gmailWatchPollInterval(undefined, phone)).toBe(0);
  });

  it("doesn't poll when it can't be seen or there's nothing to watch", () => {
    expect(gmailWatchPollInterval([item("extracting")], { ...web, canPoll: false })).toBe(0);
    expect(gmailWatchPollInterval([item("extracting")], { ...web, skip: true })).toBe(0);
  });
});
