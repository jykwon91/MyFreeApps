import { useRef, type KeyboardEvent } from "react";
import { Loader2 } from "lucide-react";
import { MAP_STYLE, MAP_STYLE_ARROW_STEPS, MAP_STYLE_OPTIONS } from "@/games/wow-forever/data/worldMap/mapStyle";
import type { MapStyle } from "@/games/wow-forever/types/mapStyle/mapStyle";

interface MapStyleToggleProps {
  /** What the map shows right now (a failed satellite view shows the drawn map). */
  value: MapStyle;
  /** The satellite picture is still downloading. */
  busy: boolean;
  onChange: (style: MapStyle) => void;
  /** The pointer or focus is on "Satellite": start the download early. */
  onPreload: () => void;
}

const SEGMENT =
  "flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 px-3 text-xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500";

/**
 * Map / Satellite — bottom-left of the map box, apart from the zoom buttons
 * (camera) and the Layers button (data). A radio group: one Tab stop, arrow
 * keys move the choice.
 */
export default function MapStyleToggle({ value, busy, onChange, onPreload }: MapStyleToggleProps) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  function keyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = MAP_STYLE_ARROW_STEPS[e.key];
    if (step === undefined) return;
    e.preventDefault();
    const at = MAP_STYLE_OPTIONS.findIndex((o) => o.value === value);
    const next = (at + step + MAP_STYLE_OPTIONS.length) % MAP_STYLE_OPTIONS.length;
    onChange(MAP_STYLE_OPTIONS[next].value);
    buttons.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label="Map style"
      onKeyDown={keyDown}
      className="absolute bottom-2 left-2 z-[1000] flex overflow-hidden rounded-md border bg-card shadow-sm"
    >
      {MAP_STYLE_OPTIONS.map((option, i) => {
        const checked = option.value === value;
        const loading = busy && option.value === MAP_STYLE.satellite;
        return (
          <button
            key={option.value}
            ref={(el) => {
              buttons.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-busy={loading || undefined}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(option.value)}
            onPointerEnter={option.value === MAP_STYLE.satellite ? onPreload : undefined}
            onFocus={option.value === MAP_STYLE.satellite ? onPreload : undefined}
            className={`${SEGMENT} ${checked ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          >
            {loading && <Loader2 aria-hidden className="h-3 w-3 animate-spin" />}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
