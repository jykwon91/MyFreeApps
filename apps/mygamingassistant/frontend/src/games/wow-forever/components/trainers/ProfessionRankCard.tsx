import CraftRankTrainer from "@/games/wow-forever/components/crafting/CraftRankTrainer";
import MilestoneWhere from "@/games/wow-forever/components/professions/MilestoneWhere";
import { forFaction } from "@/games/wow-forever/lib/forFaction";
import { rankFacts } from "@/games/wow-forever/lib/trainers/rankFacts";
import type { ProfessionRankStep } from "@/games/wow-forever/types/trainers/professionRankStep";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

interface ProfessionRankCardProps {
  step: ProfessionRankStep;
  professionLabel: string;
  faction: PlayerFaction;
  zoneId: number | null;
}

/** One rank: the skill and level it needs, the cap it gives, and who trains it when that isn't every trainer. */
export default function ProfessionRankCard({ step, professionLabel, faction, zoneId }: ProfessionRankCardProps) {
  return (
    <li className="space-y-2 rounded-xl border bg-card p-3" data-testid="trainers-rank">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 className="font-semibold">{step.name}</h3>
        <span className="text-sm text-muted-foreground">{rankFacts(step)}</span>
      </div>
      {step.milestone ? <p className="text-sm">{forFaction(step.milestone.detail, faction)}</p> : null}
      {step.milestone ? <MilestoneWhere step={step.milestone} faction={faction} zoneId={zoneId} /> : null}
      {step.craftingRank ? (
        <CraftRankTrainer rank={step.craftingRank} faction={faction} professionLabel={professionLabel} zoneId={zoneId} />
      ) : null}
      {!step.milestone && !step.craftingRank ? <p className="text-sm text-muted-foreground">Any trainer below.</p> : null}
    </li>
  );
}
