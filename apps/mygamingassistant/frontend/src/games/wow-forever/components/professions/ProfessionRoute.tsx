import RouteRow from "@/games/wow-forever/components/professions/RouteRow";
import type { MatPlace } from "@/games/wow-forever/components/professions/RouteMatList";
import SkillColorLegend from "@/games/wow-forever/components/professions/SkillColorLegend";
import type { RouteStep } from "@/games/wow-forever/data/professions/professionTypes";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

interface ProfessionRouteProps {
  steps: readonly RouteStep[];
  faction: PlayerFaction;
  /** Column names, e.g. "Materials"/"Recipe from" for Cooking, "Where"/"Spot" for Fishing. */
  columns: { name: string; materials: string; source: string };
  showLegend: boolean;
  /** Where materials come from — Cooking; Fishing has none. */
  matPlace?: MatPlace;
}

/** The leveling route as a list that stacks into cards on phones — no sideways scrolling. */
export default function ProfessionRoute({ steps, faction, columns, showLegend, matPlace }: ProfessionRouteProps) {
  // When most rows are unconfirmed, a chip on each is noise — one caption says it.
  const unconfirmed = steps.filter((s) => s.confidence === "unconfirmed").length;
  const mostlyUnconfirmed = unconfirmed > steps.length / 2;
  const caption = mostlyUnconfirmed
    ? "This is mostly the Classic route — not yet confirmed for Forever."
    : "Unconfirmed = Classic or community info not yet checked in Forever.";

  return (
    <div className="space-y-2">
      {showLegend ? <SkillColorLegend /> : null}
      <p className="text-xs text-muted-foreground">{caption}</p>
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="hidden sm:grid sm:grid-cols-[6rem_1fr_1fr_1fr] sm:gap-4 p-3 border-b text-sm font-medium" aria-hidden>
          <span>Skill</span>
          <span>{columns.name}</span>
          <span>{columns.materials}</span>
          <span>{columns.source}</span>
        </div>
        <ol className="divide-y">
          {steps.map((step) => (
            <RouteRow
              key={`${step.skill}-${step.name}`}
              step={step}
              faction={faction}
              showChip={!mostlyUnconfirmed}
              materialsLabel={columns.materials}
              sourceLabel={columns.source}
              matPlace={matPlace}
            />
          ))}
        </ol>
      </div>
    </div>
  );
}
