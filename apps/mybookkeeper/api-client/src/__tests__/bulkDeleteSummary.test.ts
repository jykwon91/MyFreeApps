import { describe, expect, it } from "vitest";
import { summariseBulkDelete } from "../utils/bulkDeleteSummary";

describe("summariseBulkDelete", () => {
  it("counts the deleted ids and sorts the skipped ones by reason", () => {
    expect(
      summariseBulkDelete({
        deleted: ["a"],
        skipped: [
          { id: "b", reason: "not_found" },
          { id: "c", reason: "being_read" },
        ],
        failedIds: ["d"],
        error: new Error("x"),
      }),
    ).toEqual({ deleted: 1, alreadyGone: 1, beingReadIds: ["c"], failedIds: ["d"] });
  });

  it("is clean when nothing was skipped or failed", () => {
    expect(summariseBulkDelete({ deleted: ["a", "b"], skipped: [], failedIds: [], error: null })).toEqual({
      deleted: 2,
      alreadyGone: 0,
      beingReadIds: [],
      failedIds: [],
    });
  });
});
