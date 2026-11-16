import type { ReactNode } from "react";
import CraftSpecChip from "@/games/wow-forever/components/crafting/CraftSpecChip";
import RecipeRef from "@/games/wow-forever/components/recipes/RecipeRef";
import TrainerRecipeStatusChip from "@/games/wow-forever/components/trainers/TrainerRecipeStatusChip";
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
  known: "",
  "can-learn": "bg-primary/5",
  "needs-skill": "",
  "needs-data": "",
};

/** One recipe a trainer teaches: icon, name link, your status with it, learn skill, training cost. */
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
          <TrainerRecipeStatusChip status={status} skill={skill} />
          {status !== "needs-skill" && <div>Skill {skill}</div>}
          {cost > 0 && <div>{formatPrice(cost)}</div>}
        </div>
      </div>
      {footer}
    </li>
  );
}
