import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * The tab's title while the calling page is shown; the title before it comes back when the page goes.
 *
 * Re-applied on every path change, not only when `title` changes: the root layout's `useResetDocumentTitle`
 * puts the default title back on each navigation, so a page kept mounted across routes (a list and its
 * detail view) would otherwise lose its title.
 *
 * Not React 19's hoisted `<title>`: React adopts `index.html`'s own `<title>` element and removes it on unmount,
 * which would leave every page after this one untitled.
 */
export function useDocumentTitle(title: string): void {
  const { pathname } = useLocation();
  useEffect(() => {
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title, pathname]);
}
