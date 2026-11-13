import DungeonFactRow from "@/games/wow-forever/components/dungeons/DungeonFactRow";
import { DETAIL_SECTION } from "@/games/wow-forever/components/food/detail/detailStyles";
import { FOREVER_DUNGEON_COPY } from "@/games/wow-forever/data/dungeons/dungeonPageConfig";
import { entryText, groupSizeText } from "@/games/wow-forever/lib/dungeons/describeDungeon";
import type { Dungeon } from "@/games/wow-forever/types/dungeons/dungeon";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";
import { instanceLevelText } from "@/games/wow-forever/worldMap/levels";

/** "When can I do it?": the dungeon's level, the level its door lets you in at, group size and keys. */
export default function DungeonWhen({ dungeon }: { dungeon: Dungeon }) {
  return (
    <section aria-labelledby="dungeon-when" className={DETAIL_SECTION}>
      <h2 id="dungeon-when" className="font-semibold">
        When you can go
      </h2>
      <dl className="space-y-2">
        <DungeonFactRow label="Recommended level" provenance={PROVENANCE.client}>
          {instanceLevelText(dungeon)}
        </DungeonFactRow>
        {dungeon.requiredLevel !== null ? (
          <DungeonFactRow label="Lowest level to go in" provenance={PROVENANCE.classic}>
            Level {dungeon.requiredLevel}
          </DungeonFactRow>
        ) : (
          <DungeonFactRow label="Lowest level to go in">{FOREVER_DUNGEON_COPY.notKnown}</DungeonFactRow>
        )}
        {dungeon.maxPlayers !== null ? (
          <DungeonFactRow label="Group size" provenance={PROVENANCE.client}>
            {groupSizeText(dungeon.maxPlayers)}
          </DungeonFactRow>
        ) : null}
        {dungeon.entryRequirements !== null ? (
          <DungeonFactRow label="Key or attunement to go in" provenance={PROVENANCE.classic}>
            {entryText(dungeon.entryRequirements)}
          </DungeonFactRow>
        ) : (
          <DungeonFactRow label="Key or attunement to go in">{FOREVER_DUNGEON_COPY.notKnown}</DungeonFactRow>
        )}
        {dungeon.lockedDoorKeys.length > 0 ? (
          <DungeonFactRow label="Locked doors inside open with" provenance={PROVENANCE.classic}>
            {dungeon.lockedDoorKeys.join(", ")}
          </DungeonFactRow>
        ) : null}
      </dl>
    </section>
  );
}
