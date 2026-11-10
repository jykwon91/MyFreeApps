import type { BatchedRun } from "../types/bulk/BatchedRun";

/** Split ids into requests the server will accept. */
export function chunkIds(ids: readonly string[], size: number): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
}

/**
 * Sends the ids in batches of at most `size`, in order, stopping at the first batch that errors (a failing
 * server would only fail the rest too). Responses already received are kept; the ids of the failed batch
 * and every later one are reported as not sent.
 */
export async function runInBatches<R>(
  ids: readonly string[],
  size: number,
  send: (ids: string[]) => Promise<R>,
): Promise<BatchedRun<R>> {
  const responses: R[] = [];
  const batches = chunkIds(ids, size);
  for (const [index, batch] of batches.entries()) {
    try {
      responses.push(await send(batch));
    } catch (error) {
      return { responses, failedIds: batches.slice(index).flat(), error };
    }
  }
  return { responses, failedIds: [], error: null };
}
