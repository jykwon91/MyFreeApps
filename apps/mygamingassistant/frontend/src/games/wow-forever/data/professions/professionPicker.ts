import { PROFESSION, type Profession } from "@/games/wow-forever/data/professions/professionTypes";
import { CRAFTING_PROFESSION, type CraftingProfession } from "@/games/wow-forever/types/crafting";
import type { GatheringProfession } from "@/games/wow-forever/types/gathering/gatheringProfession";
import type { SecondaryProfession } from "@/games/wow-forever/types/secondaryProfession";

/** Every guide on the Professions page. */
export type GuideProfession = Profession | CraftingProfession;

export interface ProfessionGroup<T extends GuideProfession> {
  label: string;
  options: readonly { id: T; label: string }[];
}

/** Main professions, alphabetical — you can learn two of them. */
export const CRAFTING_GROUP: ProfessionGroup<CraftingProfession> = {
  label: "Crafting",
  options: [
    { id: CRAFTING_PROFESSION.alchemy, label: "Alchemy" },
    { id: CRAFTING_PROFESSION.blacksmithing, label: "Blacksmithing" },
    { id: CRAFTING_PROFESSION.enchanting, label: "Enchanting" },
    { id: CRAFTING_PROFESSION.engineering, label: "Engineering" },
    { id: CRAFTING_PROFESSION.leatherworking, label: "Leatherworking" },
    { id: CRAFTING_PROFESSION.tailoring, label: "Tailoring" },
  ],
};

/** Gathering professions — main professions too, so they count toward your two. */
export const GATHERING_GROUP: ProfessionGroup<GatheringProfession> = {
  label: "Gathering",
  options: [
    { id: PROFESSION.herbalism, label: "Herbalism" },
    { id: PROFESSION.mining, label: "Mining" },
    { id: PROFESSION.skinning, label: "Skinning" },
  ],
};

/** Secondary professions — anyone can learn all of them. First Aid is one, though its guide is a crafting guide. */
export const SECONDARY_GROUP: ProfessionGroup<SecondaryProfession | typeof CRAFTING_PROFESSION.firstaid> = {
  label: "Secondary",
  options: [
    { id: PROFESSION.cooking, label: "Cooking" },
    { id: CRAFTING_PROFESSION.firstaid, label: "First Aid" },
    { id: PROFESSION.fishing, label: "Fishing" },
  ],
};

/** The picker's groups, in order. */
export const PROFESSION_GROUPS: readonly ProfessionGroup<GuideProfession>[] = [CRAFTING_GROUP, GATHERING_GROUP, SECONDARY_GROUP];

/** Under the picker. Classic Era's rule — Forever hasn't said otherwise yet. */
export const TWO_PROFESSIONS_NOTE = "You can learn two main professions, crafting or gathering (Classic rule), plus every secondary one.";
