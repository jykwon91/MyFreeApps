import ForeverQuestRow from "@/games/wow-forever/components/dungeons/foreverQuests/ForeverQuestRow";
import { DETAIL_SECTION } from "@/games/wow-forever/components/food/detail/detailStyles";
import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import SegmentedToggle from "@/games/wow-forever/components/shared/SegmentedToggle";
import { FOREVER_DUNGEON_QUESTS_COPY } from "@/games/wow-forever/data/dungeons/dungeonPageConfig";
import { PLAYER_FACTION_OPTIONS } from "@/games/wow-forever/data/playerFactionOptions";
import { usePlayerSettings } from "@/games/wow-forever/hooks/usePlayerSettings";
import { questsForFaction } from "@/games/wow-forever/lib/dungeons/describeQuest";
import type { Dungeon } from "@/games/wow-forever/types/dungeons/dungeon";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";

/**
 * A new Forever dungeon's quests, from Blizzard's Game Data API, for your
 * faction (the World Map's saved faction). The API gives no level, giver or
 * objective, so a level shows only for a quest the game has been seen showing.
 */
export default function ForeverDungeonQuests({ dungeon }: { dungeon: Pick<Dungeon, "foreverQuests"> }) {
  const [player, setPlayer] = usePlayerSettings();
  const quests = dungeon.foreverQuests;
  const shown = questsForFaction(quests, player.faction);
  return (
    <section aria-labelledby="dungeon-quests" className={DETAIL_SECTION} data-testid="dungeon-quests">
      <h2 id="dungeon-quests" className="font-semibold">
        {FOREVER_DUNGEON_QUESTS_COPY.heading}
      </h2>
      {quests.length > 0 ? (
        <>
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {FOREVER_DUNGEON_QUESTS_COPY.source} <ProvenanceBadge provenance={PROVENANCE.published} />
          </p>
          <p className="text-xs text-muted-foreground">{FOREVER_DUNGEON_QUESTS_COPY.notInData}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-xs font-medium text-muted-foreground">{FOREVER_DUNGEON_QUESTS_COPY.factionLabel}</span>
            <SegmentedToggle
              label={FOREVER_DUNGEON_QUESTS_COPY.factionLabel}
              options={PLAYER_FACTION_OPTIONS}
              value={player.faction}
              onChange={(faction) => setPlayer({ faction })}
            />
          </div>
        </>
      ) : null}
      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {quests.length === 0 ? FOREVER_DUNGEON_QUESTS_COPY.none : FOREVER_DUNGEON_QUESTS_COPY.noneForFaction}
        </p>
      ) : (
        <ul>
          {shown.map((q) => (
            <ForeverQuestRow key={q.id} quest={q} />
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">{FOREVER_DUNGEON_QUESTS_COPY.zoneQuests}</p>
    </section>
  );
}
