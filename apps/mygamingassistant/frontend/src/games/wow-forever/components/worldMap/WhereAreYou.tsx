import { useMemo, useState } from "react";
import { MapPin } from "lucide-react";
import SearchCombobox from "@/games/wow-forever/components/worldMap/SearchCombobox";
import WhereSummary from "@/games/wow-forever/components/worldMap/WhereSummary";
import type { WorldMapData } from "@/games/wow-forever/types/worldMap";
import { parseCoords } from "@/games/wow-forever/worldMap/parseCoords";
import { findPlaces, placeLabel, type Place } from "@/games/wow-forever/worldMap/places";
import {
  WHERE_RESULT,
  placeSpot,
  resolveWhere,
  splitPlaceAndCoords,
  type WhereSpot,
} from "@/games/wow-forever/worldMap/where";

interface WhereAreYouProps {
  data: WorldMapData;
  places: readonly Place[];
  zoneId: number | null;
  position: { x: number; y: number } | null;
  onSet: (zoneId: number, position: { x: number; y: number } | null) => void;
}

interface Choice {
  options: readonly Place[];
  position: { x: number; y: number } | null;
}

/**
 * "Where are you?": a place name ("Goldshire", "Stormwind"), what the
 * minimap shows ("Old Town 78.4, 53.2"), bare coordinates or a /way command.
 * The line under it always says where the page thinks you are.
 */
export default function WhereAreYou({ data, places, zoneId, position, onSet }: WhereAreYouProps) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [lastSet, setLastSet] = useState<WhereSpot | null>(null);

  const typed = useMemo(() => {
    if (parseCoords(text)) return { suggestions: [], position: null };
    const split = splitPlaceAndCoords(text);
    if (!split) return { suggestions: [], position: null };
    return { suggestions: findPlaces(split.name, places), position: split.position };
  }, [text, places]);

  function apply(spot: WhereSpot) {
    setText("");
    setError(null);
    setChoice(null);
    setLastSet(spot);
    onSet(spot.zoneId, spot.position);
  }

  function choosePlace(place: Place, at: { x: number; y: number } | null) {
    if (at) apply({ zoneId: place.zoneId, position: at, approximate: false, onCurrentZone: false });
    else apply(placeSpot(place));
  }

  function submit() {
    const result = resolveWhere(text, data, places, zoneId);
    if (result.kind === WHERE_RESULT.error) {
      setError(result.message);
      setChoice(null);
      return;
    }
    if (result.kind === WHERE_RESULT.choose) {
      setError(null);
      setChoice({ options: result.options, position: result.position });
      return;
    }
    apply(result);
  }

  function pick(id: string) {
    const place = places.find((p) => p.id === id);
    if (place) choosePlace(place, typed.position);
  }

  // What was last typed here only describes the spot while it's still the one saved.
  const current = lastSet?.zoneId === zoneId && lastSet.position === position ? lastSet : null;

  return (
    <div className="space-y-2">
      <SearchCombobox
        id="wm-where"
        label="Where are you?"
        placeholder='"Goldshire", "Old Town 78.4, 53.2" or "42.1, 65.9"'
        value={text}
        onValueChange={(value) => {
          setText(value);
          setError(null);
        }}
        groups={[
          {
            label: "Places",
            options: typed.suggestions.map((place) => ({ id: place.id, primary: placeLabel(place) })),
          },
        ]}
        onPick={pick}
        onSubmit={submit}
        invalid={error !== null}
        describedBy={error ? "wm-where-error" : undefined}
        icon={<MapPin className="h-4 w-4" aria-hidden />}
        action={
          <button type="button" onClick={submit} className="rounded-md border px-3 text-sm min-h-[44px] hover:bg-muted/40">
            Set
          </button>
        }
      />
      {error && (
        <p id="wm-where-error" role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      {choice && (
        <div role="group" aria-label="Which place?" className="space-y-1">
          <p className="text-sm">Which one?</p>
          <div className="flex flex-wrap gap-2">
            {choice.options.map((place) => (
              <button
                key={place.id}
                type="button"
                onClick={() => choosePlace(place, choice.position)}
                className="rounded-md border px-3 text-sm min-h-[44px] hover:bg-muted/40"
              >
                {placeLabel(place)}
              </button>
            ))}
          </div>
        </div>
      )}
      <WhereSummary
        data={data}
        places={places}
        zoneId={zoneId}
        position={position}
        approximate={current?.approximate ?? false}
        onCurrentZone={current?.onCurrentZone ?? false}
        onMoveMap={(mapId) => {
          if (position) apply({ zoneId: mapId, position, approximate: false, onCurrentZone: false });
        }}
      />
    </div>
  );
}
