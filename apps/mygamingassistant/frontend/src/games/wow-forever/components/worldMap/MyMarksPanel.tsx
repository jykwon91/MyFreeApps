import { useMemo, useState } from "react";
import clsx from "clsx";
import { ChevronDown, Crosshair, MapPin } from "lucide-react";
import MapMarkRow from "@/games/wow-forever/components/worldMap/MapMarkRow";
import MapRouteList from "@/games/wow-forever/components/worldMap/MapRouteList";
import { MAX_ROUTE_STOPS } from "@/games/wow-forever/data/worldMap/mapMarks";
import type { MapMarksState } from "@/games/wow-forever/hooks/useMapMarks";
import type { MapView } from "@/games/wow-forever/types/worldMap";
import { routeMarks } from "@/games/wow-forever/worldMap/mapMarks";
import { routeDistance } from "@/games/wow-forever/worldMap/routeDistance";

interface MyMarksPanelProps {
  map: MapView;
  state: MapMarksState;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  placing: boolean;
  onPlacingChange: (placing: boolean) => void;
  onAddAtCentre: () => void;
  /** A mark just added: its name box gets focus. */
  focusId: string | null;
  onFocused: () => void;
}

const BUTTON = "inline-flex items-center gap-1.5 rounded-md border px-3 text-sm min-h-[44px] sm:min-h-[36px] hover:bg-muted/40 disabled:opacity-50";

/**
 * "My marks" under the map: your marks on the viewed map (rename, restyle,
 * delete with Undo), a way to add one without right-click or a long press,
 * and your route through them with straight-line yards.
 */
export default function MyMarksPanel(props: MyMarksPanelProps) {
  const { map, state, open, onOpenChange, placing, onPlacingChange, focusId, onFocused } = props;
  const { marks } = state;
  const [announce, setAnnounce] = useState("");
  const stops = useMemo(() => routeMarks(marks), [marks]);
  const distance = useMemo(() => routeDistance(map, stops), [map, stops]);
  const stopOf = useMemo(() => new Map(marks.route.map((id, i) => [id, i + 1])), [marks.route]);
  const routeFull = marks.route.length >= MAX_ROUTE_STOPS;
  const full = state.room === 0;

  function move(index: number, delta: number) {
    const mark = stops[index];
    state.moveStop(index, delta);
    if (mark) setAnnounce(`${mark.label} is now stop ${index + delta + 1}`);
  }

  return (
    <section aria-labelledby="wm-my-marks" className="rounded-xl border">
      <h3 id="wm-my-marks" className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls="wm-my-marks-body"
          onClick={() => onOpenChange(!open)}
          className="flex w-full items-center justify-between gap-2 px-3 text-left text-base font-semibold min-h-[48px]"
        >
          <span>
            My marks <span className="tabular-nums text-muted-foreground">({marks.marks.length})</span>
          </span>
          <ChevronDown aria-hidden className={clsx("h-4 w-4 transition-transform", open && "rotate-180")} />
        </button>
      </h3>
      {open && (
        <div id="wm-my-marks-body" className="space-y-3 border-t p-3">
          <p className="text-xs text-muted-foreground">
            Right-click the map (or press and hold on a touch screen) to add a mark. Marks are saved in this browser only, per map.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" aria-pressed={placing} disabled={full && !placing} onClick={() => onPlacingChange(!placing)} className={clsx(BUTTON, placing && "border-blue-500 bg-blue-500/10")}>
              <MapPin aria-hidden className="h-4 w-4" />
              {placing ? "Cancel placing" : "Place a mark"}
            </button>
            <button type="button" disabled={full} onClick={props.onAddAtCentre} className={BUTTON}>
              <Crosshair aria-hidden className="h-4 w-4" />
              Add a mark at the map's centre
            </button>
          </div>
          {placing && <p role="status" className="text-sm">Click or tap the map where the mark goes. Esc to cancel.</p>}
          {full && <p className="text-sm text-muted-foreground">This map has as many marks as it can hold — delete one to add another.</p>}
          {state.undo && (
            <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-1 text-sm">
              <span>{state.undo.message}</span>
              <span className="flex gap-2">
                <button type="button" onClick={state.applyUndo} className="rounded-md border bg-card px-3 font-medium min-h-[44px] sm:min-h-[32px]">
                  Undo
                </button>
                <button type="button" onClick={state.dismissUndo} aria-label="Dismiss" className="rounded-md px-3 min-h-[44px] sm:min-h-[32px]">
                  ✕
                </button>
              </span>
            </div>
          )}
          {marks.marks.length === 0 && <p className="text-sm text-muted-foreground">No marks on {map.name} yet.</p>}
          {marks.marks.length > 0 && (
            <ul className="space-y-2">
              {marks.marks.map((mark) => (
                <MapMarkRow
                  key={mark.id}
                  mark={mark}
                  stop={stopOf.get(mark.id) ?? null}
                  canRoute={!routeFull}
                  autoFocus={mark.id === focusId}
                  onFocused={onFocused}
                  onRename={(label) => state.update(mark.id, { label })}
                  onStyle={(style) => state.update(mark.id, { style })}
                  onAddToRoute={() => state.addToRoute(mark.id)}
                  onDelete={() => state.remove(mark.id)}
                />
              ))}
            </ul>
          )}
          {stops.length > 0 && <MapRouteList stops={stops} distance={distance} onMove={move} onRemove={state.removeStop} onClear={state.clearRoute} />}
          <p aria-live="polite" className="sr-only">
            {announce}
          </p>
        </div>
      )}
    </section>
  );
}
