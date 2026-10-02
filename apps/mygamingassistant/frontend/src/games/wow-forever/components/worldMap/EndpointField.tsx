import { useId, useMemo, useState, type ReactNode } from "react";
import SearchCombobox, { type ComboGroup } from "@/games/wow-forever/components/worldMap/SearchCombobox";
import type { WorldMapData } from "@/games/wow-forever/types/worldMap";
import { areaLabel } from "@/games/wow-forever/worldMap/describeRank";
import { placeLabel, PLACE_KIND, type Place } from "@/games/wow-forever/worldMap/places";
import { searchMap, type SearchContext } from "@/games/wow-forever/worldMap/search";
import { normalizeText } from "@/games/wow-forever/worldMap/searchText";
import { ENDPOINT_KIND, type TripStart } from "@/games/wow-forever/worldMap/trip";
import { resolveWhere, WHERE_RESULT } from "@/games/wow-forever/worldMap/where";

/** A choice above the search results ("Your location", "Choose on map"). */
export interface FieldShortcut {
  id: string;
  primary: string;
  secondary?: string;
}

interface EndpointFieldProps {
  id: string;
  label: ReactNode;
  placeholder: string;
  /** What the box shows until the player types over it (the chosen end's name). */
  initialText: string;
  data: WorldMapData;
  places: readonly Place[];
  context: SearchContext;
  /** The zone bare coordinates are read on. */
  currentZoneId: number | null;
  onChoose: (end: TripStart) => void;
  shortcuts?: readonly FieldShortcut[];
  onShortcut?: (id: string) => void;
  icon?: ReactNode;
}

const NPC_PREFIX = "npc:";
const PLACE_PREFIX = "place:";
const SHORTCUT_PREFIX = "shortcut:";
const HAS_DIGIT = /\d/;

const PLACE_HINT: Readonly<Record<Place["kind"], string>> = {
  [PLACE_KIND.city]: "City",
  [PLACE_KIND.zone]: "Zone",
  [PLACE_KIND.district]: "District",
  [PLACE_KIND.town]: "Town",
  [PLACE_KIND.building]: "Building",
  [PLACE_KIND.area]: "Area",
};

/**
 * One end of a trip, typed like a maps app: an NPC ("Ryback", "cooking
 * trainer stormwind"), a place ("Goldshire", "SW") or coordinates
 * ("Goldshire 42.1, 65.9", "/way Elwynn Forest 42 65"). Remount it (key) to
 * show a new chosen end.
 */
export default function EndpointField(props: EndpointFieldProps) {
  const { data, places, context, onChoose, shortcuts = [], onShortcut } = props;
  const [text, setText] = useState(props.initialText);
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();
  const edited = text !== props.initialText;
  const results = useMemo(
    () => (edited ? searchMap(text, data, places, context) : { npcs: [], places: [] }),
    [edited, text, data, places, context],
  );

  const groups: ComboGroup[] = [
    { label: "Quick picks", options: shortcuts.map((s) => ({ ...s, id: `${SHORTCUT_PREFIX}${s.id}` })) },
    {
      label: "NPCs",
      options: results.npcs.map(({ poi, zone }) => ({
        id: `${NPC_PREFIX}${poi.id}`,
        primary: [poi.name, poi.title].filter(Boolean).join(" — "),
        secondary: areaLabel(poi, zone),
      })),
    },
    {
      label: "Places",
      options: results.places.map((place) => ({
        id: `${PLACE_PREFIX}${place.id}`,
        primary: placeLabel(place),
        secondary: PLACE_HINT[place.kind],
      })),
    },
  ];

  function choose(end: TripStart) {
    setError(null);
    onChoose(end);
  }

  function pick(optionId: string) {
    if (optionId.startsWith(SHORTCUT_PREFIX)) {
      setText(props.initialText);
      onShortcut?.(optionId.slice(SHORTCUT_PREFIX.length));
      return;
    }
    if (optionId.startsWith(NPC_PREFIX)) choose({ kind: ENDPOINT_KIND.npc, poiId: optionId.slice(NPC_PREFIX.length) });
    if (optionId.startsWith(PLACE_PREFIX)) choose({ kind: ENDPOINT_KIND.place, placeId: optionId.slice(PLACE_PREFIX.length) });
  }

  /** Enter with nothing highlighted: coordinates are read, a name takes the best match. */
  function submit() {
    if (!edited) return;
    const typed = text.trim();
    if (HAS_DIGIT.test(typed)) {
      const where = resolveWhere(typed, data, places, props.currentZoneId);
      if (where.kind === WHERE_RESULT.error) {
        setError(where.message);
        return;
      }
      if (where.kind === WHERE_RESULT.set) {
        const spot = where.position ?? { x: 50, y: 50 };
        choose({ kind: ENDPOINT_KIND.point, zoneId: where.zoneId, x: spot.x, y: spot.y });
        return;
      }
      const [first] = where.options;
      if (where.position) choose({ kind: ENDPOINT_KIND.point, zoneId: first.zoneId, ...where.position });
      else choose({ kind: ENDPOINT_KIND.place, placeId: first.id });
      return;
    }
    // A place typed by its name ("Goldshire") beats the NPCs who live there.
    const key = normalizeText(typed);
    const named = results.places.find((place) => [place.name, ...place.aliases].some((n) => normalizeText(n) === key));
    if (named) {
      choose({ kind: ENDPOINT_KIND.place, placeId: named.id });
      return;
    }
    const first = groups.slice(1).flatMap((g) => g.options)[0];
    if (first) pick(first.id);
    else setError(`I don't know "${typed}". Try a town, an NPC name, or coordinates like 42.1, 65.9.`);
  }

  return (
    <div className="space-y-1">
      <SearchCombobox
        id={props.id}
        label={props.label}
        placeholder={props.placeholder}
        value={text}
        onValueChange={(value) => {
          setText(value);
          setError(null);
        }}
        groups={groups}
        onPick={pick}
        onSubmit={submit}
        selectOnFocus
        emptyText={edited ? "No NPCs or places match. Check the spelling, try fewer words, or type coordinates." : undefined}
        describedBy={error ? errorId : undefined}
        invalid={error !== null}
        icon={props.icon}
      />
      {error && (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
