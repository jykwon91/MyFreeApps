import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { THEATER_MODE_STORAGE_KEY } from "@/games/wow-forever/data/worldMap/mapTheaterMode";

/** Everything on the page outside `el` (siblings of it and of each ancestor), which theater mode makes inert. */
function pageAround(el: HTMLElement): HTMLElement[] {
  const around: HTMLElement[] = [];
  for (let node: HTMLElement | null = el; node && node !== document.body; node = node.parentElement) {
    for (const sibling of Array.from(node.parentElement?.children ?? [])) {
      if (sibling !== node && sibling instanceof HTMLElement && !sibling.hasAttribute("inert")) {
        around.push(sibling);
      }
    }
  }
  return around;
}

function readStoredActive(): boolean {
  try {
    return localStorage.getItem(THEATER_MODE_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function writeStoredActive(value: boolean): void {
  try {
    localStorage.setItem(THEATER_MODE_STORAGE_KEY, value ? "true" : "false");
  } catch {
    // ignore — private browsing or storage full
  }
}

/**
 * Theater mode for the World Map: fills the viewport with the map overlay, hiding
 * the app chrome (sidebar, header, bottom nav) via `inert` and locking body scroll.
 *
 * Owned at the page level so the RoutePlanner, MapSearchResults, and WorldMapPanel
 * can all be included inside the fixed overlay, keeping every map control accessible.
 *
 * `escapeTaken` prevents theater exit when MapCanvas is using Esc for its own chain
 * (placing a mark, a pick in progress, or a result selected).
 *
 * `beforeChange` runs synchronously, in the event handler, right before the mode flips (by the
 * button or by Esc) — while the outgoing map is still mounted — so the page can note the view to carry over.
 */
export function useMapTheaterMode(frameRef: RefObject<HTMLElement | null>, escapeTaken: boolean, beforeChange?: () => void) {
  const [active, setActive] = useState(readStoredActive);
  const beforeChangeRef = useRef(beforeChange);
  useEffect(() => {
    beforeChangeRef.current = beforeChange;
  });

  const toggle = useCallback(() => {
    beforeChangeRef.current?.();
    setActive((on) => !on);
  }, []);
  const exit = useCallback(() => {
    beforeChangeRef.current?.();
    setActive(false);
  }, []);

  useEffect(() => {
    writeStoredActive(active);
  }, [active]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!active || !frame) return;
    const around = pageAround(frame);
    for (const el of around) el.setAttribute("inert", "");
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      for (const el of around) el.removeAttribute("inert");
      document.body.style.overflow = prevOverflow;
    };
  }, [active, frameRef]);

  useEffect(() => {
    if (!active) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape" || e.defaultPrevented || escapeTaken) return;
      beforeChangeRef.current?.();
      setActive(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [active, escapeTaken]);

  return { active, toggle, exit };
}
