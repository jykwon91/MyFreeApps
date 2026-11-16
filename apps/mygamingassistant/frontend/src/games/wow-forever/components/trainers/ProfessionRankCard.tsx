import CraftRankTrainer from "@/games/wow-forever/components/crafting/CraftRankTrainer";
import RankRecipesList from "@/games/wow-forever/components/trainers/RankRecipesList";
import MilestoneWhere from "@/games/wow-forever/components/professions/MilestoneWhere";
import { forFaction } from "@/games/wow-forever/lib/forFaction";
import { rankFacts } from "@/games/wow-forever/lib/trainers/rankFacts";
import type { CraftingProfession } from "@/games/wow-forever/types/crafting";
import type { ProfessionRankStep } from "@/games/wow-forever/types/trainers/professionRankStep";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

interface ProfessionRankCardProps {
  step: ProfessionRankStep;
  professionLabel: string;
  faction: PlayerFaction;
  zoneId: number | null;
  /** When provided, trainer names become buttons that open the recipe list. */
  onSelectTrainer?: (npcId: number) => void;
  /** A crafting profession: what this rank teaches. Absent for gathering, Cooking and Fishing. */
  recipes?: { profession: CraftingProfession; steps: readonly ProfessionRankStep[] };
}

/** One rank: the skill and level it needs, the cap it gives, and who trains it when that isn't every trainer. */
export default function ProfessionRankCard({ step, professionLabel, faction, zoneId, onSelectTrainer, recipes }: ProfessionRankCardProps) {
  return (
    <li className="space-y-2 rounded-xl border bg-card p-3" data-testid="trainers-rank">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 className="font-semibold">{step.name}</h3>
        <span className="text-sm text-muted-foreground">{rankFacts(step)}</span>
      </div>
      {step.milestone ? <p className="text-sm">{forFaction(step.milestone.detail, faction)}</p> : null}
      {step.milestone ? <MilestoneWhere step={step.milestone} faction={faction} zoneId={zoneId} /> : null}
      {step.craftingRank ? (
        <CraftRankTrainer rank={step.craftingRank} faction={faction} professionLabel={professionLabel} zoneId={zoneId} onSelectTrainer={onSelectTrainer} />
      ) : null}
      {!step.milestone && !step.craftingRank ? <p className="text-sm text-muted-foreground">Any trainer below.</p> : null}
      {recipes ? <RankRecipesList rankName={step.name} profession={recipes.profession} steps={recipes.steps} /> : null}
    </li>
  );
}
