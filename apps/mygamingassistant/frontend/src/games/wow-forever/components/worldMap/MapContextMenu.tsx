import { useEffect, useRef, type CSSProperties, type KeyboardEvent } from "react";
import { ClipboardCopy, MapPin, ZoomOut } from "lucide-react";
import { MOBILE_SHEET_QUERY } from "@/games/wow-forever/data/worldMap/mapViewer";
import type { MapMenuTarget } from "@/games/wow-forever/types/mapMarks/mapMenuTarget";
import { formatMapCoords } from "@/games/wow-forever/worldMap/routeDistance";

interface MapContextMenuProps {
  target: MapMenuTarget;
  /** False when this map (or every map) has as many marks as it can hold. */
  canAdd: boolean;
  /** The map "Zoom out" goes to; null at the top of the tree (the item is left out). */
  parentName: string | null;
  onAdd: () => void;
  onCopy: () => void;
  onZoomOut: () => void;
  onClose: () => void;
}

const ITEM_CLASS =
  "flex w-full items-center gap-3 rounded-md px-3 text-left text-sm min-h-[48px] sm:min-h-[40px] hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none aria-disabled:opacity-50 aria-disabled:hover:bg-transparent";

/** Opens away from the nearest edges of the map box, so it never hangs off the map. */
function placement(target: MapMenuTarget): CSSProperties {
  const style: CSSProperties = {};
  if (target.boxX < target.boxWidth / 2) style.left = target.boxX;
  else style.right = target.boxWidth - target.boxX;
  if (target.boxY < target.boxHeight / 2) style.top = target.boxY;
  else style.bottom = target.boxHeight - target.boxY;
  return style;
}

/**
 * The map menu at the point that was right-clicked / long-pressed: add a mark,
 * copy the spot's coordinates, zoom out. A sheet along the bottom on phones,
 * a small menu at the point on wider screens. Arrow keys move between items,
 * Esc or a click elsewhere closes it, and focus goes back to the map.
 */
export default function MapContextMenu({ target, canAdd, parentName, onAdd, onCopy, onZoomOut, onClose }: MapContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const coords = formatMapCoords(target.x, target.y);

  useEffect(() => {
    menuRef.current?.querySelector<HTMLButtonElement>("[role=menuitem]:not([aria-disabled=true])")?.focus({ preventScroll: true });
    function outside(e: PointerEvent) {
      if (!menuRef.current?.contains(e.target as Node)) onClose();
    }
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [onClose]);

  function keyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape" || e.key === "Tab") {
      if (e.key === "Escape") {
        e.preventDefault();
        // Never on to the map, where Esc zooms out.
        e.stopPropagation();
      }
      onClose();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? []);
    if (items.length === 0) return;
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    let next = 0;
    if (e.key === "End") next = items.length - 1;
    else if (e.key === "ArrowDown") next = (at + 1) % items.length;
    else if (e.key === "ArrowUp") next = (at - 1 + items.length) % items.length;
    items[next].focus();
  }

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={`Map menu at ${coords}`}
      data-testid="map-context-menu"
      onKeyDown={keyDown}
      onContextMenu={(e) => e.preventDefault()}
      // A phone gets the bottom sheet (classes only); a wider screen the menu at the point.
      style={window.matchMedia?.(MOBILE_SHEET_QUERY).matches ? undefined : placement(target)}
      className="fixed inset-x-0 bottom-0 z-[1200] rounded-t-xl border bg-card p-2 pb-4 shadow-2xl sm:absolute sm:inset-x-auto sm:bottom-auto sm:w-60 sm:max-w-[calc(100%-1rem)] sm:rounded-xl sm:pb-2"
    >
      <div aria-hidden className="mx-auto mb-1 h-1.5 w-10 rounded-full bg-muted-foreground/40 sm:hidden" />
      <p className="px-3 py-1 text-xs text-muted-foreground tabular-nums">At {coords}</p>
      {/* aria-disabled, not disabled: it stays reachable, so a keyboard / screen-reader user hears why. */}
      <button type="button" role="menuitem" aria-disabled={!canAdd} onClick={canAdd ? onAdd : undefined} className={ITEM_CLASS}>
        <MapPin aria-hidden className="h-4 w-4" />
        {canAdd ? "Add a mark here" : "This map's marks are full"}
      </button>
      <button type="button" role="menuitem" onClick={onCopy} className={ITEM_CLASS}>
        <ClipboardCopy aria-hidden className="h-4 w-4" />
        Copy coordinates
      </button>
      {parentName && (
        <button type="button" role="menuitem" onClick={onZoomOut} className={ITEM_CLASS}>
          <ZoomOut aria-hidden className="h-4 w-4" />
          Zoom out to {parentName}
        </button>
      )}
    </div>
  );
}
