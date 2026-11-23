import { useEffect, useRef } from "react";
import { isTypingFocused } from "@/utils/isTypingFocused";

/**
 * A ref for a step's heading (give it `tabIndex={-1}`), focused whenever `viewKey` changes, so a
 * page that swaps one step's content for another doesn't drop focus to the page. Not on first
 * render, where the route's own focus handling applies, and not away from a field being typed in.
 */
export function useFocusHeadingOnChange<T extends HTMLElement>(viewKey: string) {
  const headingRef = useRef<T>(null);
  const shownKey = useRef(viewKey);

  useEffect(() => {
    if (shownKey.current === viewKey) return;
    shownKey.current = viewKey;
    if (!isTypingFocused()) headingRef.current?.focus();
  }, [viewKey]);

  return headingRef;
}
