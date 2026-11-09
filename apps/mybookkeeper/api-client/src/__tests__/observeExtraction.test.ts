import { describe, expect, it } from "vitest";
import type { EmailQueueItem } from "../types/integration/email-queue-item";
import { INITIAL_EXTRACTION_SNAPSHOT, observeExtraction } from "../utils/observeExtraction";

function item(id: string, status: EmailQueueItem["status"]): EmailQueueItem {
  return { id, sync_log_id: 1, attachment_filename: null, email_subject: null, status, error: null, created_at: null };
}

describe("observeExtraction", () => {
  it("only sets the baseline the first time, even on a settled queue", () => {
    const first = observeExtraction(INITIAL_EXTRACTION_SNAPSHOT, [item("a", "done"), item("b", "failed")]);
    expect(first.completed).toBe(false);
    expect(first.snapshot.seeded).toBe(true);
  });

  it("reports completion when something that was extracting no longer is", () => {
    const first = observeExtraction(INITIAL_EXTRACTION_SNAPSHOT, [item("a", "extracting")]);
    expect(observeExtraction(first.snapshot, [item("a", "extracting")]).completed).toBe(false);
    expect(observeExtraction(first.snapshot, [item("a", "done")]).completed).toBe(true);
  });

  it("reports completion when an item leaves the queue while extracting", () => {
    const first = observeExtraction(INITIAL_EXTRACTION_SNAPSHOT, [item("a", "extracting")]);
    expect(observeExtraction(first.snapshot, []).completed).toBe(true);
  });

  it("catches an item that went from fetched to done between two slow polls", () => {
    const first = observeExtraction(INITIAL_EXTRACTION_SNAPSHOT, [item("a", "fetched")]);
    expect(observeExtraction(first.snapshot, [item("a", "done")]).completed).toBe(true);
  });

  it("catches an item that failed between two polls", () => {
    const first = observeExtraction(INITIAL_EXTRACTION_SNAPSHOT, [item("a", "fetched")]);
    expect(observeExtraction(first.snapshot, [item("a", "failed")]).completed).toBe(true);
  });

  it("does not report the same finished item twice", () => {
    const first = observeExtraction(INITIAL_EXTRACTION_SNAPSHOT, [item("a", "fetched")]);
    const second = observeExtraction(first.snapshot, [item("a", "done")]);
    expect(observeExtraction(second.snapshot, [item("a", "done")]).completed).toBe(false);
  });
});
