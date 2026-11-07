import { Minus, Plus } from "lucide-react";

interface MapZoomControlsProps {
  /** The viewer is ready to zoom (Leaflet loaded). */
  enabled: boolean;
  isZoomed: boolean;
  canZoomIn: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
}

const BUTTON =
  "flex items-center justify-center rounded-md border bg-card shadow-sm min-h-[44px] min-w-[44px] disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500";

/**
 * Magnify the map picture in / out a step and back to the whole picture —
 * bottom-right, clear of the markers' usual crowding at the top. Not the same
 * as "Zoom out" in the breadcrumb, which goes up to the parent map.
 */
export default function MapZoomControls({ enabled, isZoomed, canZoomIn, onZoomIn, onZoomOut, onReset }: MapZoomControlsProps) {
  return (
    <div className="absolute bottom-2 right-2 z-[1000] flex items-end gap-2">
      {isZoomed && (
        <button type="button" onClick={onReset} className={`${BUTTON} px-3 text-xs`}>
          Reset zoom
        </button>
      )}
      <div role="group" aria-label="Map zoom" className="flex flex-col gap-1">
        <button type="button" aria-label="Zoom the map in" disabled={!enabled || !canZoomIn} onClick={onZoomIn} className={BUTTON}>
          <Plus aria-hidden className="h-4 w-4" />
        </button>
        <button type="button" aria-label="Zoom the map out" disabled={!enabled || !isZoomed} onClick={onZoomOut} className={BUTTON}>
          <Minus aria-hidden className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
