import type { MouseEvent } from "react";
import { MAIN_CONTENT_ID } from "../../constants/main-content";

/**
 * "Skip to main content": the first stop for a keyboard user, so they can get
 * past the sidebar and header without tabbing through every link. Hidden until
 * it has focus. Moves focus to the shell's `<main id={MAIN_CONTENT_ID}
 * tabIndex={-1}>` rather than following a `#hash`, which would change the URL
 * and fight the router.
 */
export default function SkipLink() {
  function skipToMain(event: MouseEvent<HTMLAnchorElement>) {
    const main = document.getElementById(MAIN_CONTENT_ID);
    if (main === null) return;
    event.preventDefault();
    main.focus();
  }

  return (
    <a
      href={`#${MAIN_CONTENT_ID}`}
      onClick={skipToMain}
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-md focus:ring-2 focus:ring-primary focus:outline-none"
    >
      Skip to main content
    </a>
  );
}
