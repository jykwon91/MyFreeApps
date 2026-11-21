import { useCallback, useEffect, useRef, useState } from "react";
import { INBOX_POLL_INTERVAL_MS, SCORING_WINDOW_MS } from "../constants/discoverScoring";
import type { ScoringWindow } from "../types/discovery/scoring-window";

/**
 * Scores arrive in the background for about 30 seconds after a refresh. A refresh that adds
 * postings calls `open`, which polls the inbox so the scores fill in without a reload, unless the
 * inbox is filtered to another saved search, whose postings the refresh didn't touch. The window
 * remembers which saved search was refreshed and is judged against the filter as it is now, not as
 * it was when the refresh was tapped: a refresh can take minutes, and the filter can change meanwhile. The window closes
 * after SCORING_WINDOW_MS, or once nothing is left unscored. Only a refresh opens it: the unscored
 * count also rises when the filter widens or a dismiss is undone, and neither brings new scores.
 * The scorer rates only each day's top postings, so a steady unscored tail is expected and the
 * polling never runs forever.
 *
 * `inboxSourceId` is the saved search the inbox is filtered to, or null for All.
 *
 * Its polling interval goes to the inbox query, whose unscored count comes back through
 * `useScoringActive`, which calls `observe`.
 */
export function useScoringWindow(inboxSourceId: string | null): ScoringWindow {
  const [openedSourceId, setOpenedSourceId] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const close = useCallback(() => {
    clearTimer();
    setOpenedSourceId(null);
  }, [clearTimer]);

  const open = useCallback(
    (refreshedSourceId: string) => {
      clearTimer();
      timerRef.current = setTimeout(close, SCORING_WINDOW_MS);
      setOpenedSourceId(refreshedSourceId);
    },
    [clearTimer, close],
  );

  const observe = useCallback(
    (unscored: number | null) => {
      if (unscored === 0) close();
    },
    [close],
  );

  useEffect(() => clearTimer, [clearTimer]);

  // Open only while the inbox shows the refreshed saved search, or All.
  const isOpen = openedSourceId !== null && (inboxSourceId === null || inboxSourceId === openedSourceId);

  return { isOpen, pollingInterval: isOpen ? INBOX_POLL_INTERVAL_MS : 0, open, observe };
}
