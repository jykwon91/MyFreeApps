import FoodSourceList from "@/games/wow-forever/components/food/detail/FoodSourceList";
import WowheadLink from "@/games/wow-forever/components/WowheadLink";
import { hasSources, isNewInForever, unknownSource } from "@/games/wow-forever/food/recipeSources";
import { wowheadForeverItemUrl, wowheadForeverSpellUrl } from "@/games/wow-forever/lib/wowheadUrl";
import type { SourceLookup } from "@/games/wow-forever/data/sourceDecode";
import type { CraftingFile, LearnAt } from "@/games/wow-forever/types/crafting";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

/** Where the player is, and what the guide knows about where things come from. */
export interface CraftPlace {
  sources: SourceLookup;
  faction: PlayerFaction;
  zoneId: number | null;
  /** The player's level, to rank the mobs they can farm first. Null = not set. */
  level: number | null;
  /** Which profession makes a material, and the recipes to make this profession's own (bolts). */
  file: Pick<CraftingFile, "madeBy" | "recipes" | "smelting">;
}

interface CraftLearnLineProps {
  learn: LearnAt;
  professionLabel: string;
  place: CraftPlace;
  /** Recipe spell id — when provided, adds a Wowhead link for Forever trainer rows. */
  spellId?: number;
}

function trainerText(learn: Extract<LearnAt, { kind: "trainer" }>, professionLabel: string): string {
  // No Classic trainer teaches a recipe Forever added — don't name one.
  if (learn.newInForever) return `New in Forever: source not known yet (probably a ${professionLabel} trainer, at about skill ${learn.skill})`;
  if (learn.estimated) return `${professionLabel} trainer, at about skill ${learn.skill}`;
  return `${professionLabel} trainer, at skill ${learn.skill}`;
}

/** How to learn a route recipe; a Pattern / Formula opens to where it's sold or dropped. */
export default function CraftLearnLine({ learn, professionLabel, place, spellId }: CraftLearnLineProps) {
  if (learn.kind === "start") return <p className="text-sm">Known when you train {professionLabel}</p>;

  if (learn.kind === "trainer") {
    if (learn.newInForever && spellId !== undefined) {
      return (
        <div className="space-y-1">
          <p className="text-sm">{trainerText(learn, professionLabel)}</p>
          <WowheadLink href={wowheadForeverSpellUrl(spellId)} className="text-sm text-primary underline" />
        </div>
      );
    }
    return <p className="text-sm">{trainerText(learn, professionLabel)}</p>;
  }

  const sources = place.sources.recipe(learn.itemId);
  return (
    <details className="text-sm group">
      <summary className="cursor-pointer min-h-[44px] sm:min-h-0 py-1 marker:text-muted-foreground">
        <span className="font-medium">{learn.item}</span> <span className="text-muted-foreground">(skill {learn.skill})</span>
      </summary>
      <div className="pt-2 space-y-1">
        {hasSources(sources) ? (
          <FoodSourceList sources={sources} faction={place.faction} zoneId={place.zoneId} level={place.level} />
        ) : (
          <>
            <p className="text-sm text-muted-foreground">{unknownSource(learn.itemId, "it")}</p>
            {isNewInForever(learn.itemId) ? (
              <WowheadLink href={wowheadForeverItemUrl(learn.itemId)} className="text-sm text-primary underline" />
            ) : null}
          </>
        )}
      </div>
    </details>
  );
}
