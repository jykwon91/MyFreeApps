import { useEffect } from "react";

/** Scrolls the element with this id into view when the page opens on `#id` (the router doesn't). */
export function useScrollToHashOnLoad(id: string): void {
  useEffect(() => {
    if (window.location.hash !== `#${id}`) return;
    document.getElementById(id)?.scrollIntoView({ block: "start" });
  }, [id]);
}
