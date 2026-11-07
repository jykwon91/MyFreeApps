/**
 * Writes a screen is still holding back (an undo window) that must reach the server before the session
 * ends. A screen registers its flush while mounted; `signOutAfterSaving` (lib/auth.ts) awaits every one
 * before the token is cleared, so a Sign out anywhere (shell or screen) never drops or 401s them.
 */
type Flush = () => Promise<void>;

const flushes = new Set<Flush>();

/** Register a flush; returns the unregister function (use it as an effect cleanup). */
export function registerPendingWrites(flush: Flush): () => void {
  flushes.add(flush);
  return () => {
    flushes.delete(flush);
  };
}

/** Send everything still held back. A failing flush never blocks the others. */
export async function flushPendingWrites(): Promise<void> {
  await Promise.allSettled([...flushes].map((flush) => flush()));
}
