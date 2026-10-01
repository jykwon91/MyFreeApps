import clsx from "clsx";
import UnconfirmedChip from "@/games/wow-forever/components/professions/UnconfirmedChip";
import CraftColorsLine from "@/games/wow-forever/components/crafting/CraftColorsLine";
import CraftLearnLine, { type CraftPlace } from "@/games/wow-forever/components/crafting/CraftLearnLine";
import CraftReagents from "@/games/wow-forever/components/crafting/CraftReagents";
import { rowStateClass, type RowState } from "@/games/wow-forever/components/crafting/craftRowStyles";
import { learnAt } from "@/games/wow-forever/crafting/craftRoute";
import type { CraftRecipe, CraftRouteOptions, TrainerSkills } from "@/games/wow-forever/types/crafting";

interface CraftOptionsRowProps {
  step: CraftRouteOptions;
  recipes: readonly CraftRecipe[];
  trainerSkills: TrainerSkills;
  state: RowState;
  professionLabel: string;
  place: CraftPlace;
}

/** The end of the route where several recipes could work — each with its skill, materials and source. */
export default function CraftOptionsRow({ step, recipes, trainerSkills, state, professionLabel, place }: CraftOptionsRowProps) {
  return (
    <li
      id={`craft-${step.from}`}
      aria-current={state === "current" ? "step" : undefined}
      className={clsx("p-3 space-y-3 scroll-mt-24", rowStateClass(state))}
    >
      <div className="space-y-1">
        <p className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-muted px-2 py-0.5 text-sm font-semibold tabular-nums">
            {step.from}–{step.to}
          </span>
          <span className="font-medium">{step.title}</span>
          {state === "current" ? (
            <span className="rounded bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">You are here</span>
          ) : null}
          {step.confidence === "unconfirmed" ? <UnconfirmedChip /> : null}
        </p>
        <p className="text-sm text-muted-foreground">{step.intro}</p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {recipes.map((recipe, i) => (
          <li key={recipe.spell} className="rounded-lg border bg-card p-3 space-y-1.5">
            <p className="font-medium">{recipe.name}</p>
            <p className="text-xs text-muted-foreground">{step.options[i].detail}</p>
            <CraftColorsLine recipe={recipe} />
            <CraftReagents reagents={recipe.reagents} />
            <CraftLearnLine learn={learnAt(recipe, trainerSkills)} professionLabel={professionLabel} place={place} />
          </li>
        ))}
      </ul>
    </li>
  );
}
