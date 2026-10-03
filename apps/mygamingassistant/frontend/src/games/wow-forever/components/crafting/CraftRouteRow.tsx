import clsx from "clsx";
import UnconfirmedChip from "@/games/wow-forever/components/professions/UnconfirmedChip";
import CraftColorsLine from "@/games/wow-forever/components/crafting/CraftColorsLine";
import CraftLearnLine, { type CraftPlace } from "@/games/wow-forever/components/crafting/CraftLearnLine";
import CraftReagents from "@/games/wow-forever/components/crafting/CraftReagents";
import CraftRowCost from "@/games/wow-forever/components/crafting/CraftRowCost";
import { CRAFT_ROW_GRID, rowStateClass, type RowState } from "@/games/wow-forever/components/crafting/craftRowStyles";
import type { ResolvedCraftStep } from "@/games/wow-forever/types/crafting";

interface CraftRouteRowProps {
  entry: ResolvedCraftStep;
  state: RowState;
  showChip: boolean;
  /** It makes a tool later rows need (a runed rod). */
  makesTool: boolean;
  professionLabel: string;
  place: CraftPlace;
}

/** One recipe on the route: a card on phones, a 4-column row from `sm` up, with tool and note underneath. */
export default function CraftRouteRow({ entry, state, showChip, makesTool, professionLabel, place }: CraftRouteRowProps) {
  const { step, recipe, crafts, learn } = entry;
  return (
    <li
      id={`craft-${step.from}`}
      aria-current={state === "current" ? "step" : undefined}
      className={clsx("p-3 space-y-2 scroll-mt-24", rowStateClass(state))}
    >
      <div className={CRAFT_ROW_GRID}>
        <div className="space-y-1 min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-muted px-2 py-0.5 text-sm font-semibold tabular-nums">
              {step.from}–{step.to}
            </span>
            <span className="font-medium">{recipe.name}</span>
            {state === "current" ? (
              <span className="rounded bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">You are here</span>
            ) : null}
            {showChip && step.confidence === "unconfirmed" ? <UnconfirmedChip /> : null}
          </p>
          <CraftColorsLine recipe={recipe} />
        </div>
        <p className="text-sm">
          <span className="sm:hidden text-muted-foreground">Make about </span>
          <span className="hidden sm:inline">×</span>
          <span className="font-semibold tabular-nums">{crafts}</span>
        </p>
        <div>
          <p className="sm:hidden text-xs text-muted-foreground">Each craft takes</p>
          <CraftReagents reagents={recipe.reagents} place={place} professionLabel={professionLabel} />
        </div>
        <div>
          <p className="sm:hidden text-xs text-muted-foreground">Learn</p>
          <CraftLearnLine learn={learn} professionLabel={professionLabel} place={place} />
        </div>
      </div>
      {/* Done rows are history — what they cost no longer matters. */}
      {state === "done" ? null : <CraftRowCost entry={entry} />}
      {recipe.tool || makesTool || step.note ? (
        <div className="space-y-1 text-xs text-muted-foreground">
          {makesTool ? <p className="font-medium text-foreground">Tool — make one, keep it in your bags.</p> : null}
          {recipe.tool ? <p>Needs a {recipe.tool.name} in your bags.</p> : null}
          {step.note ? <p>{step.note}</p> : null}
        </div>
      ) : null}
    </li>
  );
}
