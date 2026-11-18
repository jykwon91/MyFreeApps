import { runBulkCounts } from "@mybookkeeper/api-client/utils/runBulkCounts";
import { isCancelledRequest } from "@platform/core/utils/isCancelledRequest";
import { useToast } from "@platform/mobile";
import { useRef, useState } from "react";
import type { BulkTransactionRunOptions } from "../../types/BulkTransactionRunOptions";

/**
 * Runs a bulk action over any number of ids, in batches the server accepts, and says how many went through.
 * Answers with the ids that did not make it (none means every batch worked), so the screen keeps just those selected.
 * A second call while one is on its way does nothing and hands the ids straight back. A run a cache reset
 * called off (sign-out, workspace switch) says nothing: there's nobody left to tell.
 */
export function useBulkTransactionRun<K extends string>({ keys, send, outcome, failure }: BulkTransactionRunOptions<K>) {
  const { showToast } = useToast();
  const [isRunning, setIsRunning] = useState(false);
  const running = useRef(false);

  async function run(ids: readonly string[]): Promise<string[]> {
    if (running.current || ids.length === 0) return [...ids];
    running.current = true;
    setIsRunning(true);
    try {
      const result = await runBulkCounts(ids, keys, send);
      if (isCancelledRequest(result.error)) return result.failedIds;
      const wentThrough = keys.some((key) => result.counts[key] > 0);
      if (result.failedIds.length > 0 && !wentThrough) showToast(failure(result.error), "error");
      else {
        const message = outcome(result);
        showToast(message.text, message.isError ? "error" : "success");
      }
      return result.failedIds;
    } finally {
      running.current = false;
      setIsRunning(false);
    }
  }

  return { run, isRunning };
}
