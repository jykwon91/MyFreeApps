import DungeonQuestRow from "@/games/wow-forever/components/dungeons/quests/DungeonQuestRow";
import { DETAIL_SECTION } from "@/games/wow-forever/components/food/detail/detailStyles";
import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import SegmentedToggle from "@/games/wow-forever/components/shared/SegmentedToggle";
import { DUNGEON_QUESTS_EMPTY } from "@/games/wow-forever/data/dungeons/dungeonPageConfig";
import { PLAYER_FACTION_OPTIONS } from "@/games/wow-forever/data/playerFactionOptions";
import { usePlayerSettings } from "@/games/wow-forever/hooks/usePlayerSettings";
import { questsForFaction } from "@/games/wow-forever/lib/dungeons/describeQuest";
import type { Dungeon } from "@/games/wow-forever/types/dungeons/dungeon";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";

const FACTION_LABEL = "Quests for";

/**
 * The dungeon's quests for your faction (the World Map's saved faction):
 * the ones filed under it and the ones with an objective only found inside.
 */
export default function DungeonQuests({ dungeon }: { dungeon: Pick<Dungeon, "quests"> }) {
  const [player, setPlayer] = usePlayerSettings();
  const shown = questsForFaction(dungeon.quests, player.faction);
  return (
    <section aria-labelledby="dungeon-quests" className={DETAIL_SECTION} data-testid="dungeon-quests">
      <h2 id="dungeon-quests" className="font-semibold">
        Quests
      </h2>
      <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        Every quest here is in the Forever game files <ProvenanceBadge provenance={PROVENANCE.client} />
      </p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-xs font-medium text-muted-foreground">{FACTION_LABEL}</span>
        <SegmentedToggle
          label={FACTION_LABEL}
          options={PLAYER_FACTION_OPTIONS}
          value={player.faction}
          onChange={(faction) => setPlayer({ faction })}
        />
      </div>
      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {dungeon.quests.length === 0 ? DUNGEON_QUESTS_EMPTY.none : DUNGEON_QUESTS_EMPTY.noneForFaction}
        </p>
      ) : (
        <ul>
          {shown.map((q) => (
            <DungeonQuestRow key={q.id} quest={q} />
          ))}
        </ul>
      )}
    </section>
  );
}
