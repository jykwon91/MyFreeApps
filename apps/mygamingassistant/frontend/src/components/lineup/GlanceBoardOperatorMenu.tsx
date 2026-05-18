/**
 * GlanceBoardOperatorMenu — ⚙ dropdown for operator-only map actions.
 *
 * Houses actions that were previously scattered in the MapPage header:
 *   - Add lineup
 *   - Edit zones (superuser)
 *   - Replace minimap (superuser)
 *   - Unplaceable lineups notice (if applicable)
 *
 * Opened via the ⚙ chip in the top bar. Closes on outside-click or Escape.
 */
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ImagePlus, Pencil, Plus, Settings2 } from "lucide-react";

interface GlanceBoardOperatorMenuProps {
  gameSlug: string;
  mapSlug: string;
  isSuperuser: boolean;
  unplaceableCount: number;
  onReplaceMinimapClick: () => void;
}

export default function GlanceBoardOperatorMenu({
  gameSlug,
  mapSlug,
  isSuperuser,
  unplaceableCount,
  onReplaceMinimapClick,
}: GlanceBoardOperatorMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside-click
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const addLineupHref = `/lineups/new?game=${gameSlug}&map=${mapSlug}`;

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={[
          "inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs border transition-colors min-h-[30px]",
          open ? "bg-muted" : "bg-card hover:bg-muted/40",
        ].join(" ")}
        aria-expanded={open}
        aria-haspopup="menu"
        title="Map actions"
        aria-label="Map actions"
      >
        <Settings2 className="w-3.5 h-3.5" aria-hidden />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-30 bg-card border rounded-lg shadow-lg py-1 min-w-[180px]"
          role="menu"
          aria-label="Map actions menu"
        >
          <Link
            to={addLineupHref}
            className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/40 transition-colors"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <Plus className="w-4 h-4 flex-shrink-0" aria-hidden />
            Add lineup
          </Link>

          {isSuperuser && (
            <>
              <Link
                to={`/${gameSlug}/${mapSlug}/zones/edit`}
                className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/40 transition-colors"
                role="menuitem"
                onClick={() => setOpen(false)}
                title="Author the clickable zone polygons for this map"
              >
                <Pencil className="w-4 h-4 flex-shrink-0" aria-hidden />
                Edit zones
              </Link>
              <button
                type="button"
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/40 transition-colors text-left"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onReplaceMinimapClick();
                }}
                title="Replace this map's minimap image"
              >
                <ImagePlus className="w-4 h-4 flex-shrink-0" aria-hidden />
                Replace minimap
              </button>
            </>
          )}

          {unplaceableCount > 0 && (
            <>
              <div className="mx-2 my-1 border-t border-border" role="separator" />
              <div className="px-3 py-2 text-xs text-muted-foreground">
                {unplaceableCount} lineup{unplaceableCount !== 1 ? "s" : ""} can't be placed on the minimap
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
