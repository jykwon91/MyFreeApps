import { Fragment, type ReactNode } from "react";
import SkillColorLegend from "@/games/wow-forever/components/professions/SkillColorLegend";
import CraftOptionsRow from "@/games/wow-forever/components/crafting/CraftOptionsRow";
import CraftRankRow from "@/games/wow-forever/components/crafting/CraftRankRow";
import CraftRouteRow from "@/games/wow-forever/components/crafting/CraftRouteRow";
import type { CraftPlace } from "@/games/wow-forever/components/crafting/CraftLearnLine";
import { CRAFT_ROW_GRID, type RowState } from "@/games/wow-forever/components/crafting/craftRowStyles";
import type { CraftingRank } from "@/games/wow-forever/data/professions/crafting/craftingTrainers";
import type { ResolvedRouteEntry, TrainerSkills } from "@/games/wow-forever/types/crafting";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

interface CraftRouteListProps {
  entries: readonly ResolvedRouteEntry[];
  ranks: readonly CraftingRank[];
  /** Index of the row for your skill; null = no skill given. */
  current: number | null;
  trainerSkills: TrainerSkills;
  faction: PlayerFaction;
  professionLabel: string;
  place: CraftPlace;
  /** Where the route forks into specializations: the decision row, before the first row past that skill. */
  fork: { skill: number; row: ReactNode } | null;
  /** Specialization spell -> its name, for the chips on recipes that need one. */
  specNames: ReadonlyMap<number, string>;
}

function stateOf(index: number, current: number | null): RowState {
  if (current === null || index > current) return "ahead";
  return index === current ? "current" : "done";
}

/** The route, with each rank-up as a banner before the row it's needed in. */
export default function CraftRouteList({
  entries,
  ranks,
  current,
  trainerSkills,
  faction,
  professionLabel,
  place,
  fork,
  specNames,
}: CraftRouteListProps) {
  const tools = new Set(entries.flatMap((e) => (e.kind === "craft" && e.recipe.tool ? [e.recipe.tool.id] : [])));
  const pending = [...ranks];
  const rows: ReactNode[] = [];
  let forkShown = false;
  entries.forEach((entry, i) => {
    while (pending.length && pending[0].skill < entry.step.to) {
      const rank = pending.shift() as CraftingRank;
      rows.push(<CraftRankRow key={`rank-${rank.skill}`} rank={rank} faction={faction} professionLabel={professionLabel} />);
    }
    if (fork && !forkShown && fork.skill < entry.step.to) {
      forkShown = true;
      rows.push(<Fragment key="fork">{fork.row}</Fragment>);
    }
    const state = stateOf(i, current);
    if (entry.kind === "options") {
      rows.push(
        <CraftOptionsRow
          key={`options-${entry.step.from}`}
          step={entry.step}
          recipes={entry.recipes}
          trainerSkills={trainerSkills}
          state={state}
          professionLabel={professionLabel}
          place={place}
          specNames={specNames}
        />,
      );
      return;
    }
    rows.push(
      <CraftRouteRow
        key={`${entry.step.from}-${entry.step.spell}`}
        entry={entry}
        state={state}
        showChip
        makesTool={entry.recipe.creates !== undefined && tools.has(entry.recipe.creates.id)}
        professionLabel={professionLabel}
        place={place}
      />,
    );
  });

  return (
    <div className="space-y-2">
      <SkillColorLegend />
      <p className="text-xs text-muted-foreground">
        "Make about" counts the extra crafts while a recipe is yellow or green, when a point isn't certain. Unconfirmed =
        not yet checked in Forever. Where to buy or farm materials is Classic data and may differ in Forever.
      </p>
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className={`hidden sm:grid ${CRAFT_ROW_GRID} p-3 border-b text-sm font-medium`} aria-hidden>
          <span>Skill & recipe</span>
          <span>Make</span>
          <span>Each craft takes</span>
          <span>Learn</span>
        </div>
        <ol className="divide-y">{rows}</ol>
      </div>
    </div>
  );
}
