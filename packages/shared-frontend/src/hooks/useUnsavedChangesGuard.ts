import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useBlocker, useLocation, type BlockerFunction } from "react-router-dom";
import type { UnsavedChangesGuard } from "../types/unsaved-changes-guard";
import type { UnsavedChangesGuardOptions } from "../types/unsaved-changes-guard-options";
import { useWarnBeforeUnload } from "./useWarnBeforeUnload";

/**
 * Keeps a form with unsaved changes from being thrown away without asking. While `isDirty`:
 *   - in-app navigation (links, Back, Forward) waits for an answer;
 *   - closing or reloading the tab gets the browser's own prompt;
 *   - `requestLeave` asks before running a form's own leave, such as Cancel.
 * Render `UnsavedChangesDialog` with `isAsking`, `keepEditing` and `discard`. Leave after a
 * successful save through `leaveWithoutAsking`, so the save's own navigation isn't stopped.
 * Needs a data router (`createBrowserRouter`), as react-router's `useBlocker` does.
 */
export function useUnsavedChangesGuard(
  isDirty: boolean,
  { isBusy = false }: UnsavedChangesGuardOptions = {},
): UnsavedChangesGuard {
  // Where a leave started from (a location key). Once the leave lands somewhere else, a form
  // that's still mounted is guarded again. A ref, so a navigation started in the same handler
  // sees it at once; state, so the tab-close prompt comes off before a leave that goes off the
  // site (Cancel's `navigate(-1)` on a page opened directly) can trigger it.
  const leavingFrom = useRef<string | null>(null);
  const [leavingFromKey, setLeavingFromKey] = useState<string | null>(null);
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null);
  const location = useLocation();

  const shouldBlock: BlockerFunction = ({ currentLocation, nextLocation }) =>
    isDirty &&
    leavingFrom.current !== currentLocation.key &&
    (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search);
  const blocker = useBlocker(shouldBlock);
  useWarnBeforeUnload(isDirty && leavingFromKey !== location.key);

  // A save in flight decides where the form goes, so a navigation started meanwhile is dropped.
  useEffect(() => {
    if (blocker.state === "blocked" && isBusy) blocker.reset();
  }, [blocker, isBusy]);

  function startLeaving() {
    leavingFrom.current = location.key;
    flushSync(() => setLeavingFromKey(location.key));
  }

  function leaveWithoutAsking(leave: () => void) {
    startLeaving();
    leave();
  }

  function requestLeave(leave: () => void) {
    if (!isDirty) {
      leave();
      return;
    }
    setPendingLeave(() => leave);
  }

  function keepEditing() {
    if (blocker.state === "blocked") blocker.reset();
    setPendingLeave(null);
  }

  function discard() {
    if (blocker.state === "blocked") {
      startLeaving();
      blocker.proceed();
      return;
    }
    const leave = pendingLeave;
    setPendingLeave(null);
    if (leave) leaveWithoutAsking(leave);
  }

  return {
    isAsking: (blocker.state === "blocked" && !isBusy) || pendingLeave !== null,
    requestLeave,
    leaveWithoutAsking,
    keepEditing,
    discard,
  };
}
