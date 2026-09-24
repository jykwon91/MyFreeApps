import { useState } from "react";
import PoiRow from "@/games/wow-forever/components/worldMap/PoiRow";
import QuestList from "@/games/wow-forever/components/worldMap/QuestList";
import type { PlayerFaction, WorldMapData } from "@/games/wow-forever/types/worldMap";
import { GROUP_HEADING } from "@/games/wow-forever/worldMap/describeRank";
import type { Directions } from "@/games/wow-forever/worldMap/directions";
import { QUEST_LOOKAHEAD_LEVELS } from "@/games/wow-forever/worldMap/levels";
import type { RankedQuestGiver } from "@/games/wow-forever/worldMap/worldMapModel";

const PAGE_SIZE = 5;

interface QuestGiversProps {
  data: WorldMapData;
  faction: PlayerFaction;
  level: number | null;
  givers: readonly RankedQuestGiver[];
  selectedPoiId: string | null;
  onToggle: (poiId: string) => void;
  directions: Directions | null | undefined;
}

/** Nearest quest givers with a quest you could take. */
export default function QuestGivers(props: QuestGiversProps) {
  const { data, faction, level, givers, selectedPoiId, onToggle, directions } = props;
  const [limit, setLimit] = useState(PAGE_SIZE);
  const shown = givers.slice(0, limit);

  return (
    <section aria-labelledby="wm-quests" className="space-y-3">
      <h2 id="wm-quests" className="text-lg font-semibold">
        Quests near you
      </h2>
      <p className="text-sm text-muted-foreground">
        {level === null && "Add your level above to hide quests you can't take yet and colour them by difficulty."}
        {level !== null &&
          `Quests you can take at level ${level} (or within ${QUEST_LOOKAHEAD_LEVELS} levels), coloured like your quest log.`}
      </p>
      {givers.length === 0 && <p className="text-sm text-muted-foreground">No quests found for you.</p>}
      <div className="space-y-3">
        {shown.map(({ ranked, quests }, i) => (
          <div key={ranked.poi.id} className="space-y-3">
            {(i === 0 || shown[i - 1].ranked.group !== ranked.group) && (
              <h3 className="text-sm font-semibold text-muted-foreground">{GROUP_HEADING[ranked.group]}</h3>
            )}
            <PoiRow
              ranked={ranked}
              data={data}
              faction={faction}
              heading="Quest giver"
              selected={ranked.poi.id === selectedPoiId}
              onToggle={onToggle}
              directions={directions}
            >
              <QuestList giverName={ranked.poi.name} quests={quests} level={level} />
            </PoiRow>
          </div>
        ))}
      </div>
      {givers.length > limit && (
        <button
          type="button"
          onClick={() => setLimit((n) => n + PAGE_SIZE)}
          className="rounded-md border px-4 text-sm min-h-[44px] hover:bg-muted/40"
        >
          Show more quest givers
        </button>
      )}
    </section>
  );
}
