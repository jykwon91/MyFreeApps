import { describe, expect, it } from "vitest";
import { MAX_BULK_DELETE_DOCUMENT_IDS } from "../constants/documentBulkDelete";
import { chunkDocumentIds, mergeBulkDeleteResponses } from "../utils/bulkDeleteDocuments";

describe("chunkDocumentIds", () => {
  it("keeps every request within the server cap", () => {
    const ids = Array.from({ length: MAX_BULK_DELETE_DOCUMENT_IDS * 2 + 1 }, (_, i) => `d${i}`);

    const chunks = chunkDocumentIds(ids);

    expect(chunks.map((c) => c.length)).toEqual([MAX_BULK_DELETE_DOCUMENT_IDS, MAX_BULK_DELETE_DOCUMENT_IDS, 1]);
    expect(chunks.flat()).toEqual(ids);
  });

  it("sends nothing for no ids", () => {
    expect(chunkDocumentIds([])).toEqual([]);
  });
});

describe("mergeBulkDeleteResponses", () => {
  it("concatenates deleted and skipped across requests", () => {
    const merged = mergeBulkDeleteResponses([
      { deleted: ["a"], skipped: [{ id: "b", reason: "being_read" }] },
      { deleted: ["c"], skipped: [{ id: "d", reason: "not_found" }] },
    ]);

    expect(merged).toEqual({
      deleted: ["a", "c"],
      skipped: [{ id: "b", reason: "being_read" }, { id: "d", reason: "not_found" }],
    });
  });
});
