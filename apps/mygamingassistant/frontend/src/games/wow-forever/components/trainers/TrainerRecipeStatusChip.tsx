import { Check } from "lucide-react";
import { MY_PROFESSION_COPY as COPY } from "@/games/wow-forever/data/trainers/trainersConfig";
import type { TrainerRecipeRow } from "@/games/wow-forever/types/trainers/trainerRecipeRow";

/** "Known" / "Can learn" / "Needs 225" in words, so the row's status never rests on colour alone. */
export default function TrainerRecipeStatusChip({ status, skill }: Pick<TrainerRecipeRow, "status" | "skill">) {
  if (status === "known") {
    return (
      <span className="inline-flex items-center gap-1 font-medium text-foreground" data-testid="recipe-status">
        <Check className="h-3.5 w-3.5" aria-hidden />
        {COPY.known}
      </span>
    );
  }
  if (status === "can-learn") {
    return <span className="font-semibold text-primary" data-testid="recipe-status">{COPY.canLearn}</span>;
  }
  if (status === "needs-skill") {
    return <span data-testid="recipe-status">{COPY.needs(skill)}</span>;
  }
  return null;
}
