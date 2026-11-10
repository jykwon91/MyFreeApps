import { describe, expect, it, vi } from "vitest";
import { MAX_BULK_DELETE_DOCUMENT_IDS } from "../constants/documentBulkDelete";
import { mergeBulkDeleteResponses, runBulkDelete } from "../utils/bulkDeleteDocuments";
import { chunkIds } from "../utils/runInBatches";

describe("chunkIds at the documents cap", () => {
  it("keeps every request within the server cap", () => {
    const ids = Array.from({ length: MAX_BULK_DELETE_DOCUMENT_IDS * 2 + 1 }, (_, i) => `d${i}`);

    const chunks = chunkIds(ids, MAX_BULK_DELETE_DOCUMENT_IDS);

    expect(chunks.map((c) => c.length)).toEqual([MAX_BULK_DELETE_DOCUMENT_IDS, MAX_BULK_DELETE_DOCUMENT_IDS, 1]);
    expect(chunks.flat()).toEqual(ids);
  });

  it("sends nothing for no ids", () => {
    expect(chunkIds([], MAX_BULK_DELETE_DOCUMENT_IDS)).toEqual([]);
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

describe("runBulkDelete", () => {
  const MAX = MAX_BULK_DELETE_DOCUMENT_IDS;
  const ids = Array.from({ length: MAX * 2 + 1 }, (_, i) => `d${i}`);

  it("runs the batches in order and merges what came back", async () => {
    const send = vi.fn(async (batch: string[]) => ({ deleted: batch, skipped: [] }));
    const run = await runBulkDelete(ids, send);
    expect(send.mock.calls.map(([batch]) => batch.length)).toEqual([MAX, MAX, 1]);
    expect(run).toEqual({ deleted: ids, skipped: [], failedIds: [], error: null });
  });

  it("keeps what batch 1 deleted when batch 2 fails, and reports batch 2 and the unsent batch 3 as failed", async () => {
    const boom = new Error("boom");
    const send = vi
      .fn<(batch: string[]) => Promise<{ deleted: string[]; skipped: { id: string; reason: "being_read" }[] }>>()
      .mockImplementationOnce(async (batch) => ({ deleted: batch.slice(1), skipped: [{ id: batch[0], reason: "being_read" }] }))
      .mockRejectedValueOnce(boom);
    const run = await runBulkDelete(ids, send);
    expect(send).toHaveBeenCalledTimes(2);
    expect(run.deleted).toEqual(ids.slice(1, MAX));
    expect(run.skipped).toEqual([{ id: "d0", reason: "being_read" }]);
    expect(run.failedIds).toEqual(ids.slice(MAX));
    expect(run.error).toBe(boom);
  });

  it("sends nothing for no ids", async () => {
    const send = vi.fn();
    expect(await runBulkDelete([], send)).toEqual({ deleted: [], skipped: [], failedIds: [], error: null });
    expect(send).not.toHaveBeenCalled();
  });
});
