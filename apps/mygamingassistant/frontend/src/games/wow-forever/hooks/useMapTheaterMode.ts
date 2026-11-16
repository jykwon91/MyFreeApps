import { useCallback, useEffect, useRef, useState } from "react";
import { THEATER_MODE_STORAGE_KEY } from "@/games/wow-forever/data/worldMap/mapTheaterMode";

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
 * Theater mode for the World Map: the same page, with the map about three times bigger
 * (the page widens and the map column takes most of it). Remembered per device.
 *
 * `escapeTaken` prevents theater exit when MapCanvas is using Esc for its own chain
 * (placing a mark, a pick in progress, or a result selected).
 *
 * `beforeChange` runs synchronously, in the event handler, right before the mode flips (by the
 * button or by Esc), so the page can note the view to keep across the resize.
 */
export function useMapTheaterMode(escapeTaken: boolean, beforeChange?: () => void) {
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
