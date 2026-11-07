import { useLayoutEffect, useRef, type RefObject } from "react";
import { useLocation } from "react-router-dom";

/**
 * A ref for a page's scroll container that goes back to the top on every new
 * path. Pages that scroll inside an element rather than the window are out of
 * reach of the router's `ScrollRestoration`, so without this a new page opens
 * wherever the previous one was scrolled to (and the browser's scroll
 * anchoring can then push a tall page to its bottom).
 */
export function useScrollTopOnNavigate<T extends HTMLElement>(): RefObject<T | null> {
  const { pathname } = useLocation();
  const ref = useRef<T | null>(null);

  useLayoutEffect(() => {
    if (ref.current !== null) ref.current.scrollTop = 0;
  }, [pathname]);

  return ref;
}
