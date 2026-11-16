import type { ReactNode } from "react";
import { Check } from "lucide-react";
import CraftSpecChip from "@/games/wow-forever/components/crafting/CraftSpecChip";
import RecipeRef from "@/games/wow-forever/components/recipes/RecipeRef";
import { formatPrice } from "@/games/wow-forever/crafting/matPrices";
import type { CraftingProfession } from "@/games/wow-forever/types/crafting";
import type { TrainerRecipeRow as TrainerRecipeRowData } from "@/games/wow-forever/types/trainers/trainerRecipeRow";

interface TrainerRecipeRowProps {
  row: TrainerRecipeRowData;
  profession: CraftingProfession;
  /** Under the row: who teaches it, when only a trainer or two do. */
  footer?: ReactNode;
}

const STATUS_CLASS: Record<TrainerRecipeRowData["status"], string> = {
  "can-learn": "bg-primary/5",
  "needs-skill": "opacity-60",
  "needs-data": "",
};

/** One recipe a trainer teaches: icon, name link, learn skill, training cost. */
export default function TrainerRecipeRow({ row, profession, footer }: TrainerRecipeRowProps) {
  const { spell, name, skill, cost, spec, status } = row;

  return (
    <li className={`py-1 ${STATUS_CLASS[status]}`} data-testid="trainer-recipe-row">
      <div className="flex items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <RecipeRef
            profession={profession}
            spell={spell}
            name={name ?? String(spell)}
            iconSize={32}
            className="inline-flex items-center gap-1.5 font-medium text-sm"
          />
          {spec ? <CraftSpecChip name={spec} /> : null}
        </span>
        <div className="shrink-0 text-right text-xs text-muted-foreground">
          <div className="inline-flex items-center gap-1">
            {status === "can-learn" && <Check className="h-3.5 w-3.5 text-primary" aria-hidden />}
            <span>Skill {skill}</span>
            {status === "can-learn" && <span className="sr-only">(you can learn this now)</span>}
            {status === "needs-skill" && <span className="sr-only">(your skill is too low)</span>}
          </div>
          {cost > 0 && <div>{formatPrice(cost)}</div>}
        </div>
      </div>
      {footer}
    </li>
  );
}
