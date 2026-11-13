import { valueWithin } from "./valueWithin";

/**
 * Waits for `work` to finish or fail, for at most `ms`, and never rejects. For
 * teardown steps that must not hang on a page or browser that crashed or
 * stopped answering. Returns whether `work` finished in time.
 */
export async function settleWithin(work: Promise<unknown>, ms: number): Promise<boolean> {
  const finished = work.then(
    () => true,
    () => true,
  );
  return (await valueWithin(finished, ms)) ?? false;
}
