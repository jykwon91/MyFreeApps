import clsx from "clsx";
import { Loader2 } from "lucide-react";
import type { MapLayerDef } from "@/games/wow-forever/types/mapLayers/mapLayerDef";
import { layerCountText } from "@/games/wow-forever/worldMap/layerMarkers";

interface MapLayerToggleProps {
  def: MapLayerDef;
  label: string;
  checked: boolean;
  /** Markers on this map; null while the layer's data loads. */
  count: number | null;
  /** The layer's data couldn't load. */
  failed: boolean;
  onChange: (on: boolean) => void;
  onRetry: () => void;
}

/** One layer: checkbox, its marker colour, name and how many are on this map ("Flight masters (3)"). */
export default function MapLayerToggle({ def, label, checked, count, failed, onChange, onRetry }: MapLayerToggleProps) {
  // Nothing of this kind here: greyed out, but the choice is kept for maps that have some.
  const empty = count === 0;
  return (
    <div className="min-w-0">
      <label
        className={clsx(
          "flex min-w-0 items-center gap-2 text-sm min-h-[44px] sm:min-h-[32px]",
          empty ? "cursor-default text-muted-foreground" : "cursor-pointer",
        )}
      >
        <input
          type="checkbox"
          checked={checked}
          disabled={empty}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 shrink-0"
          data-layer={def.id}
        />
        <svg aria-hidden viewBox="0 0 12 12" className="h-3 w-3 shrink-0">
          <circle cx={6} cy={6} r={5} strokeWidth={1.5} className={clsx(def.markerClass, "stroke-white", empty && "opacity-50")} />
        </svg>
        <span className="min-w-0 break-words">
          {label} <span className="tabular-nums text-muted-foreground">({layerCountText(count, failed)})</span>
        </span>
        {count === null && !failed && <Loader2 aria-hidden className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
      </label>
      {failed && (
        <p className="ml-6 text-xs text-destructive">
          Couldn't load.{" "}
          <button type="button" onClick={onRetry} className="underline min-h-[44px] sm:min-h-[32px]">
            Try again
          </button>
        </p>
      )}
      {def.note && !failed && <p className="ml-6 text-xs text-muted-foreground">{def.note}</p>}
    </div>
  );
}
