import { Check } from "lucide-react";
import RecipeRef from "@/games/wow-forever/components/recipes/RecipeRef";
import { formatPrice } from "@/games/wow-forever/crafting/matPrices";
import type { CraftingProfession } from "@/games/wow-forever/types/crafting";
import type { TrainerRecipeRow as TrainerRecipeRowData } from "@/games/wow-forever/types/trainers/trainerRecipeRow";

interface TrainerRecipeRowProps {
  row: TrainerRecipeRowData;
  profession: CraftingProfession;
}

const STATUS_CLASS: Record<TrainerRecipeRowData["status"], string> = {
  "can-learn": "bg-primary/5",
  "needs-skill": "opacity-60",
  "needs-data": "",
};

/** One recipe a trainer teaches: icon, name link, learn skill, training cost. */
export default function TrainerRecipeRow({ row, profession }: TrainerRecipeRowProps) {
  const { spell, name, skill, cost, status } = row;

  return (
    <li
      className={`flex items-center justify-between gap-2 py-1 ${STATUS_CLASS[status]}`}
      data-testid="trainer-recipe-row"
    >
      <RecipeRef
        profession={profession}
        spell={spell}
        name={name ?? String(spell)}
        iconSize={32}
        className="inline-flex items-center gap-1.5 font-medium text-sm"
      />
      <div className="shrink-0 text-right text-xs text-muted-foreground">
        <div className="inline-flex items-center gap-1">
          {status === "can-learn" && <Check className="h-3.5 w-3.5 text-primary" aria-hidden />}
          <span>Skill {skill}</span>
          {status === "can-learn" && <span className="sr-only">(you can learn this now)</span>}
          {status === "needs-skill" && <span className="sr-only">(your skill is too low)</span>}
        </div>
        {cost > 0 && <div>{formatPrice(cost)}</div>}
      </div>
    </li>
  );
}
