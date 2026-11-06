import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import type { FocusLanding } from "../types/focus-landing";
import { captureFocusLanding, findFocusLandings } from "../utils/focus-landing";

/** True when nothing holds focus: it's on <body>, or on an element that was removed (the closed dialog). */
function focusIsFree(): boolean {
  const active = document.activeElement;
  return !active || active === document.body || !active.isConnected;
}

/** Focuses the first target that actually takes focus, without scrolling. */
function focusFirst(targets: readonly HTMLElement[]): void {
  for (const target of targets) {
    target.focus({ preventScroll: true });
    if (document.activeElement === target) return;
  }
}

/**
 * For dialogs opened by an ordinary button that confirming may remove (archive, delete).
 * Returns an `onCloseAutoFocus` handler for Radix Dialog.Content.
 *
 * On close, if nothing else has taken focus, it goes back to the opener. If the opener is
 * gone, focus moves to the matching control in the neighbouring item, else to
 * `fallbackRef`. While the dialog stays mounted, the opener is watched until focus moves
 * elsewhere or the user clicks: if it's removed then (for example once the list reloads),
 * focus moves the same way. A dialog that unmounts as it closes gets no watcher.
 */
export function useRestoreFocusOnClose(
  open: boolean,
  fallbackRef?: RefObject<HTMLElement | null>,
): (event: Event) => void {
  const landing = useRef<FocusLanding | null>(null);
  const mounted = useRef(false);
  const stopWatching = useRef<() => void>(() => undefined);

  // Layout effect: runs before Radix moves focus into the dialog, so the opener still has it.
  useLayoutEffect(() => {
    if (!open) return;
    stopWatching.current();
    const active = document.activeElement;
    landing.current = active instanceof HTMLElement && active !== document.body ? captureFocusLanding(active) : null;
  }, [open]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stopWatching.current();
    };
  }, []);

  function land(plan: FocusLanding) {
    const fallback = fallbackRef?.current;
    focusFirst([...findFocusLandings(plan), ...(fallback?.isConnected ? [fallback] : [])]);
  }

  function watchForRemoval(plan: FocusLanding) {
    const observer = new MutationObserver(() => {
      if (plan.element.isConnected) return;
      stop();
      if (focusIsFree()) land(plan);
    });
    const onFocusIn = (event: FocusEvent) => {
      if (event.target !== plan.element) stop();
    };
    function stop() {
      observer.disconnect();
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("pointerdown", stop);
      stopWatching.current = () => undefined;
    }
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("pointerdown", stop);
    stopWatching.current = stop;
  }

  return (event: Event) => {
    const plan = landing.current;
    if (!plan) return;
    event.preventDefault();
    if (!focusIsFree()) return;
    if (!plan.element.isConnected) {
      land(plan);
      return;
    }
    focusFirst([plan.element]);
    if (mounted.current) watchForRemoval(plan);
  };
}
