import { useEffect } from "react";

/**
 * The tab's title while the calling page is shown; the title before it comes back when the page goes.
 *
 * Not React 19's hoisted `<title>`: React adopts `index.html`'s own `<title>` element and removes it on unmount,
 * which would leave every page after this one untitled.
 */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
