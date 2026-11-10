import { describe, expect, it, vi } from "vitest";
import { MAX_BULK_TRANSACTION_IDS } from "../constants/transactionBulk";
import { runBulkCounts } from "../utils/runBulkCounts";
import { chunkIds, runInBatches } from "../utils/runInBatches";

const MAX = MAX_BULK_TRANSACTION_IDS;
const ids = Array.from({ length: MAX * 2 + 1 }, (_, i) => `t${i}`);
const KEYS = ["approved", "skipped"] as const;

describe("chunkIds", () => {
  it("keeps every request within the size", () => {
    expect(chunkIds(ids, MAX).map((c) => c.length)).toEqual([MAX, MAX, 1]);
    expect(chunkIds(ids, MAX).flat()).toEqual(ids);
  });

  it("sends nothing for no ids", () => {
    expect(chunkIds([], MAX)).toEqual([]);
  });
});

describe("runInBatches", () => {
  it("stops at the first failing batch and reports it and the unsent ones", async () => {
    const boom = new Error("boom");
    const send = vi.fn<(batch: string[]) => Promise<number>>().mockResolvedValueOnce(1).mockRejectedValueOnce(boom);

    const run = await runInBatches(ids, MAX, send);

    expect(send).toHaveBeenCalledTimes(2);
    expect(run).toEqual({ responses: [1], failedIds: ids.slice(MAX), error: boom });
  });
});

describe("runBulkCounts", () => {
  it("sends batches within the server cap and adds up the counts", async () => {
    const send = vi.fn(async (batch: string[]) => ({ approved: batch.length - 1, skipped: 1 }));

    const run = await runBulkCounts(ids, KEYS, send);

    expect(send.mock.calls.map(([batch]) => batch.length)).toEqual([MAX, MAX, 1]);
    expect(run).toEqual({ counts: { approved: ids.length - 3, skipped: 3 }, failedIds: [], error: null });
  });

  it("keeps what went through when a later batch fails", async () => {
    const boom = new Error("boom");
    const send = vi
      .fn<(batch: string[]) => Promise<{ approved: number; skipped: number }>>()
      .mockResolvedValueOnce({ approved: MAX, skipped: 0 })
      .mockRejectedValueOnce(boom);

    const run = await runBulkCounts(ids, KEYS, send);

    expect(run.counts).toEqual({ approved: MAX, skipped: 0 });
    expect(run.failedIds).toEqual(ids.slice(MAX));
    expect(run.error).toBe(boom);
  });

  it("sends nothing for no ids and reports zeros", async () => {
    const send = vi.fn();
    expect(await runBulkCounts([], KEYS, send)).toEqual({ counts: { approved: 0, skipped: 0 }, failedIds: [], error: null });
    expect(send).not.toHaveBeenCalled();
  });
});
