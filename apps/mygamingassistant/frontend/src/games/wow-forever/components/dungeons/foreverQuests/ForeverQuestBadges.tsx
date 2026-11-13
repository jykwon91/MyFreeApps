import { DETAIL_CHIP } from "@/games/wow-forever/components/food/detail/detailStyles";
import { FOREVER_DUNGEON_QUESTS_COPY } from "@/games/wow-forever/data/dungeons/dungeonPageConfig";
import type { ForeverDungeonQuest } from "@/games/wow-forever/types/dungeons/foreverDungeonQuest";

/** A Forever quest's chips: Blizzard's type ("Dungeon", "Elite"), Repeatable, and the classes it's for. */
export default function ForeverQuestBadges({ quest }: { quest: Pick<ForeverDungeonQuest, "type" | "repeatable" | "classes"> }) {
  const chips = [quest.type, quest.repeatable ? FOREVER_DUNGEON_QUESTS_COPY.repeatable : null, ...quest.classes].filter(
    (c): c is string => Boolean(c),
  );
  if (chips.length === 0) return null;
  return (
    <span className="mt-1 flex flex-wrap gap-1.5" data-testid="forever-quest-badges">
      {chips.map((chip) => (
        <span key={chip} className={DETAIL_CHIP}>
          {chip}
        </span>
      ))}
    </span>
  );
}
