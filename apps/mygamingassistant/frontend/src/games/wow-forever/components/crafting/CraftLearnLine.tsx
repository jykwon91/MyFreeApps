import FoodSourceList from "@/games/wow-forever/components/food/detail/FoodSourceList";
import { hasSources, unknownSource } from "@/games/wow-forever/food/recipeSources";
import type { SourceLookup } from "@/games/wow-forever/data/sourceDecode";
import type { LearnAt } from "@/games/wow-forever/types/crafting";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

export interface CraftPlace {
  sources: SourceLookup;
  faction: PlayerFaction;
  zoneId: number | null;
}

interface CraftLearnLineProps {
  learn: LearnAt;
  professionLabel: string;
  place: CraftPlace;
}

function trainerText(learn: Extract<LearnAt, { kind: "trainer" }>, professionLabel: string): string {
  if (learn.estimated) return `${professionLabel} trainer, at about skill ${learn.skill}`;
  return `${professionLabel} trainer, at skill ${learn.skill}`;
}

/** How to learn a route recipe; a Pattern / Formula opens to where it's sold or dropped. */
export default function CraftLearnLine({ learn, professionLabel, place }: CraftLearnLineProps) {
  if (learn.kind === "start") return <p className="text-sm">Known when you train {professionLabel}</p>;
  if (learn.kind === "trainer") return <p className="text-sm">{trainerText(learn, professionLabel)}</p>;

  const sources = place.sources.recipe(learn.itemId);
  return (
    <details className="text-sm group">
      <summary className="cursor-pointer min-h-[44px] sm:min-h-0 py-1 marker:text-muted-foreground">
        <span className="font-medium">{learn.item}</span> <span className="text-muted-foreground">(skill {learn.skill})</span>
      </summary>
      <div className="pt-2">
        {hasSources(sources) ? (
          <FoodSourceList sources={sources} faction={place.faction} zoneId={place.zoneId} />
        ) : (
          <p className="text-sm text-muted-foreground">{unknownSource(learn.itemId, "it")}</p>
        )}
      </div>
    </details>
  );
}
