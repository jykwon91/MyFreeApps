import { useEffect, useRef } from "react";

interface RefreshWatchOptions {
  /** How often to re-read the thing being refreshed. */
  pollMs: number;
  /** Stop waiting after this long. */
  timeoutMs: number;
  /** Runs on every poll, before `refetch`. */
  onPoll: () => void;
  /** Runs once when the wait times out. */
  onGiveUp: () => void;
}

/**
 * While `active`, re-read the refreshed thing every `pollMs` and give up after `timeoutMs`.
 * Stops as soon as `active` turns false (the page saw the refresh finish).
 */
export function useRefreshWatch(active: boolean, refetch: () => unknown, options: RefreshWatchOptions): void {
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });

  useEffect(() => {
    if (!active) return undefined;
    const poll = window.setInterval(() => {
      latest.current.onPoll();
      void refetch();
    }, latest.current.pollMs);
    const giveUp = window.setTimeout(() => latest.current.onGiveUp(), latest.current.timeoutMs);
    return () => {
      window.clearInterval(poll);
      window.clearTimeout(giveUp);
    };
  }, [active, refetch]);
}
