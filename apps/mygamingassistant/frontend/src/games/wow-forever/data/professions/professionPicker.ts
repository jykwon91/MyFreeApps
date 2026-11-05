import { PROFESSION, type Profession } from "@/games/wow-forever/data/professions/professionTypes";
import { CRAFTING_PROFESSION, type CraftingProfession } from "@/games/wow-forever/types/crafting";

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
    { id: CRAFTING_PROFESSION.enchanting, label: "Enchanting" },
    { id: CRAFTING_PROFESSION.tailoring, label: "Tailoring" },
  ],
};

/** Secondary professions — anyone can learn all of them. */
export const SECONDARY_GROUP: ProfessionGroup<Profession> = {
  label: "Secondary",
  options: [
    { id: PROFESSION.cooking, label: "Cooking" },
    { id: PROFESSION.fishing, label: "Fishing" },
  ],
};

/** Under the picker. Classic Era's rule — Forever hasn't said otherwise yet. */
export const TWO_PROFESSIONS_NOTE = "You can learn two crafting professions (Classic rule), plus every secondary one.";
