import { describe, expect, it } from "vitest";
import { bulkApproveMessage, bulkDeleteMessage } from "../utils/bulkTransactionMessages";

describe("bulkDeleteMessage", () => {
  it("says how many went and how many didn't when a later batch failed", () => {
    const message = bulkDeleteMessage({ counts: { deleted: 500, skipped: 0 }, failedIds: ["a"], error: new Error("boom") });
    expect(message).toEqual({ text: "Deleted 500. The rest failed \u2014 try again.", isError: true });
  });

  it("reports a plain failure when nothing went through", () => {
    const message = bulkDeleteMessage({ counts: { deleted: 0, skipped: 0 }, failedIds: ["a", "b"], error: new Error("boom") });
    expect(message).toEqual({ text: "Failed to delete transactions", isError: true });
  });

  it("reports success, including skipped ids", () => {
    expect(bulkDeleteMessage({ counts: { deleted: 3, skipped: 0 }, failedIds: [], error: null })).toEqual({
      text: "3 transaction(s) deleted",
      isError: false,
    });
    expect(bulkDeleteMessage({ counts: { deleted: 2, skipped: 1 }, failedIds: [], error: null }).text).toBe(
      "2 transaction(s) deleted, 1 skipped",
    );
  });
});

describe("bulkApproveMessage", () => {
  it("says how many went and how many didn't when a later batch failed", () => {
    const message = bulkApproveMessage({ counts: { approved: 500, skipped: 2 }, failedIds: ["a"], error: new Error("boom") });
    expect(message).toEqual({ text: "Approved 500, skipped 2. The rest failed \u2014 try again.", isError: true });
  });

  it("reports a plain failure when nothing went through", () => {
    const message = bulkApproveMessage({ counts: { approved: 0, skipped: 0 }, failedIds: ["a"], error: new Error("boom") });
    expect(message).toEqual({ text: "Failed to approve transactions", isError: true });
  });

  it("keeps the existing success wording", () => {
    expect(bulkApproveMessage({ counts: { approved: 3, skipped: 0 }, failedIds: [], error: null }).text).toBe("3 approved");
    expect(bulkApproveMessage({ counts: { approved: 2, skipped: 1 }, failedIds: [], error: null }).text).toBe("2 approved, 1 skipped");
  });
});
