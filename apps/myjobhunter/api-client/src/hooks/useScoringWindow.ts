import { useCallback, useEffect, useRef, useState } from "react";
import { INBOX_POLL_INTERVAL_MS, SCORING_WINDOW_MS } from "../constants/discoverScoring";
import type { ScoringWindow } from "../types/discovery/scoring-window";

/**
 * Scores arrive in the background for about 30 seconds after a refresh. A refresh that adds
 * postings calls `open`, which polls the inbox so the scores fill in without a reload, unless the
 * inbox is filtered to another saved search, whose postings the refresh didn't touch. The window closes
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
  const [isOpen, setIsOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const close = useCallback(() => {
    clearTimer();
    setIsOpen(false);
  }, [clearTimer]);

  const open = useCallback(
    (refreshedSourceId: string) => {
      if (inboxSourceId !== null && inboxSourceId !== refreshedSourceId) return;
      clearTimer();
      timerRef.current = setTimeout(close, SCORING_WINDOW_MS);
      setIsOpen(true);
    },
    [inboxSourceId, clearTimer, close],
  );

  const observe = useCallback(
    (unscored: number | null) => {
      if (unscored === 0) close();
    },
    [close],
  );

  useEffect(() => clearTimer, [clearTimer]);

  return { isOpen, pollingInterval: isOpen ? INBOX_POLL_INTERVAL_MS : 0, open, observe };
}
