import { useEffect } from "react";

/** While `shouldWarn` is true, closing or reloading the tab gets the browser's own "Leave site?" prompt. */
export function useWarnBeforeUnload(shouldWarn: boolean): void {
  useEffect(() => {
    if (!shouldWarn) return;
    function warn(e: BeforeUnloadEvent) {
      e.preventDefault();
      // Older browsers only prompt when returnValue is set.
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [shouldWarn]);
}
