import { describe, expect, it } from "vitest";
import type { EmailQueueItem } from "../types/integration/email-queue-item";
import { computeStatusCounts, groupBySession } from "../utils/emailQueue";

function item(overrides: Partial<EmailQueueItem>): EmailQueueItem {
  return { id: "q", sync_log_id: 1, attachment_filename: null, email_subject: null, status: "fetched", error: null, created_at: null, ...overrides };
}

describe("computeStatusCounts", () => {
  it("counts the states that are not finished and ignores done and skipped", () => {
    const counts = computeStatusCounts([
      item({ status: "fetched" }),
      item({ status: "fetched" }),
      item({ status: "extracting" }),
      item({ status: "failed" }),
      item({ status: "done" }),
      item({ status: "skipped" }),
      item({ status: "pending" }),
    ]);
    expect(counts).toEqual({ pending: 1, fetched: 2, extracting: 1, failed: 1 });
  });

  it("is all zeros for an empty queue", () => {
    expect(computeStatusCounts([])).toEqual({ pending: 0, fetched: 0, extracting: 0, failed: 0 });
  });
});

describe("groupBySession", () => {
  it("groups by sync and puts the newest sync first", () => {
    const groups = groupBySession([
      item({ id: "a", sync_log_id: 1, created_at: "2026-01-01T00:00:00Z" }),
      item({ id: "b", sync_log_id: 3 }),
      item({ id: "c", sync_log_id: 1, created_at: "2026-01-02T00:00:00Z" }),
    ]);
    expect(groups.map((group) => group.syncLogId)).toEqual([3, 1]);
    expect(groups[1].items.map((queued) => queued.id)).toEqual(["a", "c"]);
  });

  it("dates a session by its last listed item", () => {
    const [group] = groupBySession([item({ created_at: "2026-01-01T00:00:00Z" }), item({ id: "z", created_at: "2026-01-02T00:00:00Z" })]);
    expect(group.earliestCreatedAt).toBe("2026-01-02T00:00:00Z");
  });
});
