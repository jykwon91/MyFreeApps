import PriceStatus from "@/games/wow-forever/components/prices/PriceStatus";
import RouteRow from "@/games/wow-forever/components/professions/RouteRow";
import type { MatPlace } from "@/games/wow-forever/components/professions/RouteMatList";
import SkillColorLegend from "@/games/wow-forever/components/professions/SkillColorLegend";
import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import { CLASSIC_ROUTE_TAG } from "@/games/wow-forever/data/provenance/provenanceTags";
import type { RouteStep } from "@/games/wow-forever/data/professions/professionTypes";
import type { ProvenanceTag } from "@/games/wow-forever/types/provenance/provenanceTag";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";
import type { RouteBuyPlace } from "@/games/wow-forever/types/recipeVendors/routeBuyPlace";

interface ProfessionRouteProps {
  steps: readonly RouteStep[];
  faction: PlayerFaction;
  /** Column names, e.g. "Materials"/"Recipe from" for Cooking, "Where"/"Spot" for Fishing. */
  columns: { name: string; materials: string; source: string };
  showLegend: boolean;
  /** Where materials come from — Cooking; Fishing has none. */
  matPlace?: MatPlace;
  /** Where every row comes from, tagged once above the list — e.g. a gathering route is all Classic data. */
  routeTag?: ProvenanceTag;
  /** Where the route's recipes and rank's book are sold — Cooking and Fishing. */
  buy?: RouteBuyPlace;
  /** The player's World Map zone, so a milestone lists the trainer in it first. */
  zoneId?: number | null;
}

/** The leveling route as a list that stacks into cards on phones — no sideways scrolling. */
export default function ProfessionRoute({ steps, faction, columns, showLegend, matPlace, routeTag, buy, zoneId }: ProfessionRouteProps) {
  // When most rows are unconfirmed, a badge on each is noise — one tag above the list says it.
  const unconfirmed = steps.filter((s) => s.confidence === "unconfirmed").length;
  const mostlyUnconfirmed = unconfirmed > steps.length / 2;
  const listTag = routeTag ?? (mostlyUnconfirmed ? CLASSIC_ROUTE_TAG : null);

  return (
    <div className="space-y-2">
      {showLegend ? <SkillColorLegend /> : null}
      {listTag ? (
        <p className="text-xs text-muted-foreground" data-testid="route-provenance">
          {routeTag ? "This route:" : "Most of this route:"} <ProvenanceBadge {...listTag} />
        </p>
      ) : null}
      {matPlace ? <PriceStatus withoutPrices="showing the route without prices" /> : null}
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
              buy={buy}
              zoneId={zoneId}
            />
          ))}
        </ol>
      </div>
    </div>
  );
}
