import { UserRound } from "lucide-react";
import TrainerMapLink from "@/games/wow-forever/components/professions/TrainerMapLink";
import type { RankTrainer } from "@/games/wow-forever/data/professions/rankTrainerTypes";
import { RANK_RECIPES_COPY } from "@/games/wow-forever/data/trainers/trainersConfig";
import { formatCoord } from "@/games/wow-forever/worldMap/geometry";

interface RecipeOnlyFromLineProps {
  /** Your faction's trainers who teach it; empty = none of them. */
  teachers: readonly RankTrainer[];
  factionLabel: string;
}

/** Under a recipe only a trainer or two teach: who, where, and a map link — or that your faction has none. */
export default function RecipeOnlyFromLine({ teachers, factionLabel }: RecipeOnlyFromLineProps) {
  if (!teachers.length) {
    return <p className="pl-10 text-xs text-muted-foreground">{RANK_RECIPES_COPY.noTeacher(factionLabel)}</p>;
  }
  return (
    <ul className="pl-10 space-y-0.5" aria-label={RANK_RECIPES_COPY.onlyFromLabel}>
      {teachers.map((npc) => (
        <li key={npc.npcId} className="flex flex-wrap items-center justify-between gap-x-3 text-xs">
          <span className="inline-flex items-center gap-1">
            <UserRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span>
              {RANK_RECIPES_COPY.onlyFrom} <span className="font-medium">{npc.name}</span>{" "}
              <span className="text-muted-foreground">
                {npc.where} · {formatCoord(npc.x)}, {formatCoord(npc.y)}
              </span>
            </span>
          </span>
          <TrainerMapLink npc={npc} />
        </li>
      ))}
    </ul>
  );
}
