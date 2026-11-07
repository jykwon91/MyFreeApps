import ItemQuestRow from "@/games/wow-forever/components/itemPages/ItemQuestRow";
import { FACTION_NAME } from "@/games/wow-forever/components/food/detail/detailStyles";
import type { ItemQuest } from "@/games/wow-forever/types/itemPages/itemQuest";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

interface ItemQuestListProps {
  quests: readonly ItemQuest[];
  /** Set when these are quests only the other faction gets. */
  otherFaction: PlayerFaction | null;
}

export default function ItemQuestList({ quests, otherFaction }: ItemQuestListProps) {
  return (
    <div className="space-y-2">
      {otherFaction ? <p className="text-xs text-muted-foreground">{FACTION_NAME[otherFaction]} only.</p> : null}
      <ul className="space-y-2">
        {quests.map((q) => (
          <ItemQuestRow key={q.id} quest={q} />
        ))}
      </ul>
    </div>
  );
}
