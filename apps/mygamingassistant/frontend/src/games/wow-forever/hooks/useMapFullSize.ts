import { useCallback, useEffect, useState, type RefObject } from "react";

/** Everything on the page outside `el` (siblings of it and of each ancestor), which full size makes inert. */
function pageAround(el: HTMLElement): HTMLElement[] {
  const around: HTMLElement[] = [];
  for (let node: HTMLElement | null = el; node && node !== document.body; node = node.parentElement) {
    for (const sibling of Array.from(node.parentElement?.children ?? [])) {
      if (sibling !== node && sibling instanceof HTMLElement && !sibling.hasAttribute("inert")) around.push(sibling);
    }
  }
  return around;
}

/**
 * The World Map filling the window. While it's open the page under it neither
 * scrolls nor takes focus or clicks (inert), so Tab stays on the map. Esc on
 * the map leaves it from `MapCanvas`'s own Esc chain (`exit`); Esc elsewhere
 * (the toggle, the Layers button) leaves it here unless the map is using Esc
 * itself (`escapeTaken`: placing a mark or a result selected) or something
 * already took that key press.
 */
export function useMapFullSize(frameRef: RefObject<HTMLElement | null>, escapeTaken: boolean) {
  const [fullSize, setFullSize] = useState(false);
  const toggle = useCallback(() => setFullSize((on) => !on), []);
  const exit = useCallback(() => setFullSize(false), []);

  useEffect(() => {
    const frame = frameRef.current;
    if (!fullSize || !frame) return;
    const around = pageAround(frame);
    for (const el of around) el.setAttribute("inert", "");
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      for (const el of around) el.removeAttribute("inert");
      document.body.style.overflow = overflow;
    };
  }, [fullSize, frameRef]);

  useEffect(() => {
    if (!fullSize) return;
    function escape(e: KeyboardEvent) {
      if (e.key !== "Escape" || e.defaultPrevented || escapeTaken) return;
      setFullSize(false);
    }
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [fullSize, escapeTaken]);

  return { fullSize, toggle, exit };
}
