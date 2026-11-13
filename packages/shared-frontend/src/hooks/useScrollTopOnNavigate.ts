import { useLayoutEffect, useRef, type RefObject } from "react";
import { useLocation } from "react-router-dom";
import type { ScrollTopOnNavigateOptions } from "../types/scroll-top-on-navigate-options";

/**
 * A ref for a page's scroll container that goes back to the top on every new
 * path (and, with `resetWindow`, the window too). Pages that scroll inside an
 * element rather than the window are out of reach of the router's
 * `ScrollRestoration`, so without this a new page opens wherever the previous
 * one was scrolled to (and the browser's scroll anchoring can then push a tall
 * page to its bottom).
 */
export function useScrollTopOnNavigate<T extends HTMLElement>({
  resetWindow = false,
}: ScrollTopOnNavigateOptions = {}): RefObject<T | null> {
  const { pathname } = useLocation();
  const ref = useRef<T | null>(null);

  useLayoutEffect(() => {
    if (ref.current !== null) ref.current.scrollTop = 0;
    if (resetWindow) window.scrollTo(0, 0);
  }, [pathname, resetWindow]);

  return ref;
}
