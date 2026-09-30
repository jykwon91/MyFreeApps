import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import SearchCombobox, { type ComboGroup } from "@/games/wow-forever/components/worldMap/SearchCombobox";
import type { WorldMapData } from "@/games/wow-forever/types/worldMap";
import { areaLabel } from "@/games/wow-forever/worldMap/describeRank";
import { placeLabel, type Place } from "@/games/wow-forever/worldMap/places";
import { searchMap, type SearchContext } from "@/games/wow-forever/worldMap/search";

interface MapSearchProps {
  data: WorldMapData;
  places: readonly Place[];
  context: SearchContext;
  onPickNpc: (poiId: string) => void;
  onPickPlace: (place: Place) => void;
}

const PLACE_PREFIX = "place:";

/** "Find an NPC or place" — pick one to see it on the map with directions. */
export default function MapSearch({ data, places, context, onPickNpc, onPickPlace }: MapSearchProps) {
  const [text, setText] = useState("");
  const results = useMemo(() => searchMap(text, data, places, context), [text, data, places, context]);

  const groups: ComboGroup[] = [
    {
      label: "NPCs",
      options: results.npcs.map(({ poi, zone }) => ({
        id: poi.id,
        primary: [poi.name, poi.title].filter(Boolean).join(" — "),
        secondary: areaLabel(poi, zone),
      })),
    },
    {
      label: "Places",
      options: results.places.map((place) => ({
        id: `${PLACE_PREFIX}${place.id}`,
        primary: placeLabel(place),
        secondary: "Open its map",
      })),
    },
  ];

  function pick(id: string) {
    setText("");
    if (!id.startsWith(PLACE_PREFIX)) {
      onPickNpc(id);
      return;
    }
    const place = places.find((p) => `${PLACE_PREFIX}${p.id}` === id);
    if (place) onPickPlace(place);
  }

  return (
    <section aria-label="Search the map" className="max-w-2xl">
      <SearchCombobox
        id="wm-search"
        label="Find an NPC or place"
        placeholder='Try "Ryback" or "cooking trainer stormwind"'
        value={text}
        onValueChange={setText}
        groups={groups}
        onPick={pick}
        emptyText="No NPCs or places match. Check the spelling, or try fewer words."
        icon={<Search className="h-4 w-4" aria-hidden />}
      />
    </section>
  );
}
