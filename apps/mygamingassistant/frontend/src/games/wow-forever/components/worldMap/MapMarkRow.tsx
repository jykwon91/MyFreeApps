import { useEffect, useRef, type KeyboardEvent } from "react";
import clsx from "clsx";
import { Route, Trash2 } from "lucide-react";
import { MAX_MARK_LABEL_LENGTH } from "@/games/wow-forever/data/worldMap/mapMarks";
import { MAP_MARK_STYLES, isMapMarkStyle, markStyleDef, type MapMarkStyle } from "@/games/wow-forever/data/worldMap/mapMarkStyles";
import type { MapMark } from "@/games/wow-forever/types/mapMarks/mapMark";
import { formatMapCoords } from "@/games/wow-forever/worldMap/routeDistance";

interface MapMarkRowProps {
  mark: MapMark;
  /** Its stop number in the route (null = not in it). */
  stop: number | null;
  /** False when the route is full. */
  canRoute: boolean;
  /** Just added: focus the name box so it can be typed straight away. */
  autoFocus: boolean;
  onFocused: () => void;
  onRename: (label: string) => void;
  onStyle: (style: MapMarkStyle) => void;
  onAddToRoute: () => void;
  onDelete: () => void;
}

const SMALL_BUTTON =
  "inline-flex items-center justify-center gap-1.5 rounded-md border px-2.5 text-xs min-h-[44px] min-w-[44px] sm:min-h-[32px] hover:bg-muted/40 disabled:opacity-50 disabled:hover:bg-transparent";

/** One of your marks: its look, a name box (saved on Enter or leaving it), its spot, and route / delete buttons. */
export default function MapMarkRow({ mark, stop, canRoute, autoFocus, onFocused, onRename, onStyle, onAddToRoute, onDelete }: MapMarkRowProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const def = markStyleDef(mark.style);

  useEffect(() => {
    if (!autoFocus) return;
    inputRef.current?.focus();
    inputRef.current?.select();
    onFocused();
  }, [autoFocus, onFocused]);

  function save() {
    const value = inputRef.current?.value ?? "";
    if (value !== mark.label) onRename(value);
  }

  function keyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      save();
      inputRef.current?.blur();
    }
    if (e.key === "Escape" && inputRef.current) {
      e.preventDefault();
      e.stopPropagation();
      inputRef.current.value = mark.label;
      inputRef.current.blur();
    }
  }

  return (
    <li data-testid="my-mark-row" className="space-y-2 rounded-lg border p-2">
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className={clsx("inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold", def.swatchClass)}
        >
          {def.glyph}
        </span>
        <label className="min-w-0 flex-1">
          <span className="sr-only">Mark name</span>
          <input
            // A rename elsewhere (another tab) resets the box.
            key={mark.label}
            ref={inputRef}
            type="text"
            defaultValue={mark.label}
            maxLength={MAX_MARK_LABEL_LENGTH}
            onBlur={save}
            onKeyDown={keyDown}
            className="w-full rounded-md border bg-background px-2 text-sm min-h-[44px] sm:min-h-[36px]"
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-muted-foreground">
          <span className="sr-only">Look for {mark.label}</span>
          <select
            value={mark.style}
            onChange={(e) => isMapMarkStyle(e.target.value) && onStyle(e.target.value)}
            className="rounded-md border bg-background px-2 text-xs text-foreground min-h-[44px] sm:min-h-[32px]"
          >
            {MAP_MARK_STYLES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.glyph} {s.name}
              </option>
            ))}
          </select>
        </label>
        <span className="text-xs tabular-nums text-muted-foreground">{formatMapCoords(mark.x, mark.y)}</span>
        <span className="ml-auto flex gap-2">
          {stop === null ? (
            <button type="button" disabled={!canRoute} onClick={onAddToRoute} className={SMALL_BUTTON} aria-label={`Add ${mark.label} to the route`}>
              <Route aria-hidden className="h-3.5 w-3.5" />
              <span aria-hidden>Add to route</span>
            </button>
          ) : (
            <span className="self-center text-xs text-muted-foreground">Stop {stop}</span>
          )}
          <button type="button" onClick={onDelete} className={SMALL_BUTTON} aria-label={`Delete ${mark.label}`}>
            <Trash2 aria-hidden className="h-3.5 w-3.5" />
          </button>
        </span>
      </div>
    </li>
  );
}
