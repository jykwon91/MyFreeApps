import { useEffect, useRef, type KeyboardEvent } from "react";
import { Layers } from "lucide-react";
import MapLayersPanel, { type MapLayersPanelProps } from "@/games/wow-forever/components/worldMap/MapLayersPanel";
import { MOBILE_SHEET_QUERY } from "@/games/wow-forever/data/worldMap/mapViewer";
import { activeLayerCount } from "@/games/wow-forever/worldMap/layerMarkers";

interface MapLayersControlProps extends Omit<MapLayersPanelProps, "onClose"> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The "Layers" button over the map's top-left corner and its panel: a card
 * over the map on wider screens, a bottom sheet (at most about half the
 * screen) on phones so the map stays in view above it. Esc closes it and
 * focus goes back to the button — never through to the map, where Esc zooms out.
 */
export default function MapLayersControl({ open, onOpenChange, ...panel }: MapLayersControlProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const wasOpen = useRef(open);

  useEffect(() => {
    if (open && !wasOpen.current) {
      // On a phone the sheet covers the bottom of the screen: put the map at the top, above it.
      if (window.matchMedia?.(MOBILE_SHEET_QUERY).matches) {
        buttonRef.current?.closest("[data-map-frame]")?.scrollIntoView?.({ block: "start" });
      }
      headingRef.current?.focus({ preventScroll: true });
    }
    if (!open && wasOpen.current) buttonRef.current?.focus({ preventScroll: true });
    wasOpen.current = open;
  }, [open]);

  function keyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation();
    onOpenChange(false);
  }

  const on = activeLayerCount(panel.settings.layers);
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls="wm-layers-panel"
        onClick={() => onOpenChange(!open)}
        className="absolute left-2 top-2 z-[1000] inline-flex items-center gap-2 rounded-md border bg-card/95 px-3 text-sm font-medium shadow min-h-[44px]"
      >
        <Layers aria-hidden className="h-4 w-4" />
        Layers <span className="tabular-nums text-muted-foreground">({on})</span>
      </button>
      {open && (
        <div
          id="wm-layers-panel"
          role="region"
          aria-label="Map layers"
          onKeyDown={keyDown}
          className="fixed inset-x-0 bottom-0 z-[1100] max-h-[55dvh] overflow-y-auto rounded-t-xl border bg-card p-3 pt-1 shadow-2xl sm:absolute sm:inset-x-auto sm:bottom-auto sm:left-2 sm:top-14 sm:max-h-[calc(100%-4rem)] sm:w-72 sm:rounded-xl sm:pt-3"
        >
          <div aria-hidden className="mx-auto mb-1 h-1.5 w-10 rounded-full bg-muted-foreground/40 sm:hidden" />
          <MapLayersPanel ref={headingRef} {...panel} onClose={() => onOpenChange(false)} />
        </div>
      )}
    </>
  );
}
