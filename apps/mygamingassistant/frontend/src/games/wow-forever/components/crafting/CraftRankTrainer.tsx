import { AlertTriangle } from "lucide-react";
import ItemIcon from "@/games/wow-forever/components/shared/ItemIcon";
import RankTrainerList from "@/games/wow-forever/components/professions/RankTrainerList";
import CraftMapLink from "@/games/wow-forever/components/crafting/CraftMapLink";
import CraftRankErrand from "@/games/wow-forever/components/crafting/CraftRankErrand";
import type { CraftingRank } from "@/games/wow-forever/data/professions/crafting/craftingTrainers";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

interface CraftRankTrainerProps {
  rank: CraftingRank;
  faction: PlayerFaction;
  professionLabel: string;
  zoneId: number | null;
}

/** Who trains a rank: every trainer for your faction, one inside a dungeon, a book vendor or a quest giver. */
export default function CraftRankTrainer({ rank, faction, professionLabel, zoneId }: CraftRankTrainerProps) {
  const t = rank.trainers;
  if (t.kind === "list") {
    return <RankTrainerList label={`${rank.name} ${professionLabel}`} trainers={t.trainers[faction]} zoneId={zoneId} />;
  }
  if (t.kind === "book") {
    return <CraftRankErrand action={
          <>
            Buy <ItemIcon itemId={t.bookItemId} />
            {t.book} ({t.price}) from
          </>
        } npc={t.vendors[faction]} trip={t.trip[faction]} />;
  }
  if (t.kind === "quest") {
    return (
      <CraftRankErrand
        action={`Do the quest ${t.quest}, from`}
        npc={t.givers[faction]}
        detail={t.detail[faction]}
        trip={t.trip[faction]}
      />
    );
  }
  return (
    <div className="space-y-1">
      <p className="flex items-start gap-1.5 text-sm">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" aria-hidden />
        <span>
          <span className="font-medium">{t.name}</span>, inside the {t.dungeon} dungeon. {t.detail}
        </span>
      </p>
      <CraftMapLink to={t.dungeonLink} label={`Show the ${t.dungeon} entrance on the map`} />
    </div>
  );
}
