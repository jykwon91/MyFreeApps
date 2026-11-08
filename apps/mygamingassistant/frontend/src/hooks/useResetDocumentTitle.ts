import { useLayoutEffect } from "react";

/**
 * Puts the tab title back to `title` on every route change.
 *
 * Listed routes are served HTML whose `<title>` names that page (the link-preview files, see
 * `constants/linkPreview.ts`), and nothing would change it on client-side navigation, so the next page
 * would keep it. A layout effect runs before the new page's own `useDocumentTitle` effect, so a page that
 * names itself still wins.
 */
export function useResetDocumentTitle(pathname: string, title: string): void {
  useLayoutEffect(() => {
    document.title = title;
  }, [pathname, title]);
}
