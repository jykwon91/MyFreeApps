import CampObjectLearn from "@/games/wow-forever/components/crafting/CampObjectLearn";
import CraftReagents from "@/games/wow-forever/components/crafting/CraftReagents";
import type { CraftPlace } from "@/games/wow-forever/components/crafting/CraftLearnLine";
import ItemIcon from "@/games/wow-forever/components/shared/ItemIcon";
import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import { CAMP_OBJECTS_TEXT } from "@/games/wow-forever/data/professions/crafting/campObjectsText";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";
import type { CraftRecipe } from "@/games/wow-forever/types/crafting";

interface CampObjectCardProps {
  recipe: CraftRecipe;
  place: CraftPlace;
  professionLabel: string;
}

/** One camp object: name and skill, what it does in the game's words, how to learn it and what it takes. */
export default function CampObjectCard({ recipe, place, professionLabel }: CampObjectCardProps) {
  return (
    <li className="rounded-lg border border-border bg-card p-4 space-y-3" data-testid="camp-object">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="text-base font-semibold">
          {recipe.creates ? <ItemIcon itemId={recipe.creates.id} size={24} /> : null}
          {recipe.name}
        </h3>
        <span className="rounded-full border border-border px-2 py-0.5 text-xs tabular-nums">{CAMP_OBJECTS_TEXT.skill(recipe.yellow)}</span>
      </div>
      {recipe.effect ? (
        <p className="text-sm">
          {recipe.effect} <ProvenanceBadge provenance={PROVENANCE.client} />
        </p>
      ) : null}
      <div className="space-y-1">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{CAMP_OBJECTS_TEXT.learnLabel}</h4>
        <CampObjectLearn learn={recipe.learn} professionLabel={professionLabel} />
      </div>
      <div className="space-y-1">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{CAMP_OBJECTS_TEXT.materialsLabel}</h4>
        <CraftReagents reagents={recipe.reagents} place={place} professionLabel={professionLabel} />
      </div>
    </li>
  );
}
