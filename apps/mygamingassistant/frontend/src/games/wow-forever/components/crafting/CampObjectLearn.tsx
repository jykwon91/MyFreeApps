import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import ItemIcon from "@/games/wow-forever/components/shared/ItemIcon";
import { CAMP_BLUEPRINT_DROPS } from "@/games/wow-forever/data/professions/crafting/campBlueprintDrops";
import { CAMP_OBJECTS_TEXT } from "@/games/wow-forever/data/professions/crafting/campObjectsText";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";
import type { RecipeLearn } from "@/games/wow-forever/types/crafting";

interface CampObjectLearnProps {
  learn: RecipeLearn;
  professionLabel: string;
}

/** How to learn a camp object: its Blueprint (game files) and who drops it (player guides), or the trainer. */
export default function CampObjectLearn({ learn, professionLabel }: CampObjectLearnProps) {
  if (learn.source !== "item") {
    return (
      <p className="text-sm">
        {CAMP_OBJECTS_TEXT.trainer(professionLabel)}{" "}
        <ProvenanceBadge provenance={PROVENANCE.unconfirmed} detail={CAMP_OBJECTS_TEXT.trainerDetail} />
      </p>
    );
  }
  const drop = CAMP_BLUEPRINT_DROPS[learn.itemId];
  return (
    <div className="space-y-1 text-sm">
      <p>
        <ItemIcon itemId={learn.itemId} />
        <span className="font-medium">{CAMP_OBJECTS_TEXT.blueprint(learn.item, learn.skill)}</span>{" "}
        <ProvenanceBadge provenance={PROVENANCE.client} />
      </p>
      {drop ? (
        <p>
          {CAMP_OBJECTS_TEXT.dropsFrom(drop.boss, drop.place)}{" "}
          <ProvenanceBadge provenance={PROVENANCE.unconfirmed} detail={CAMP_OBJECTS_TEXT.dropDetail} />
        </p>
      ) : (
        <p className="text-muted-foreground">{CAMP_OBJECTS_TEXT.dropUnknown}</p>
      )}
    </div>
  );
}
