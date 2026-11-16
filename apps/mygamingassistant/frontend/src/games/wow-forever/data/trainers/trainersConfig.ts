import type { WowClassId } from "@/games/wow-forever/data/classes";
import type { GuideProfession } from "@/games/wow-forever/data/professions/professionPicker";
import { SERVICE_KIND } from "@/games/wow-forever/data/worldMap/serviceKinds";
import type { ClassExtraTrainer } from "@/games/wow-forever/types/trainers/classExtraTrainer";

/** The trainers page; a class or profession is `${TRAINERS_PATH}/<id>`. */
export const TRAINERS_PATH = "/wow-forever/trainers";

/** The World Map zone kind of a capital city — its trainers are listed first. */
export const CITY_ZONE_KIND = "city";

/** A profession's tag in `classicServices.json` (the generator spells First Aid with an underscore). */
export const PROFESSION_SERVICE_TAG: Readonly<Record<GuideProfession, string>> = {
  alchemy: "alchemy",
  blacksmithing: "blacksmithing",
  enchanting: "enchanting",
  engineering: "engineering",
  leatherworking: "leatherworking",
  tailoring: "tailoring",
  herbalism: "herbalism",
  mining: "mining",
  skinning: "skinning",
  cooking: "cooking",
  firstaid: "first_aid",
  fishing: "fishing",
};

/** Copy for a profession rank's "what it teaches" list. */
export const RANK_RECIPES_COPY = {
  toggle: (rank: string, count: number) => `What ${rank} teaches · ${count} ${count === 1 ? "recipe" : "recipes"}`,
  loading: (rank: string) => `What ${rank} teaches · loading…`,
  listLabel: (rank: string) => `Recipes ${rank} trainers teach`,
  error: "Couldn't load what the trainers teach.",
  /** Under a crafting profession's trainer list: the names open that trainer's own list. */
  trainerHint: "Click a trainer's name to see everything they teach.",
} as const;

/** Trainers a class visits besides its own class trainer. */
export const CLASS_EXTRA_TRAINERS: Readonly<Partial<Record<WowClassId, ClassExtraTrainer>>> = {
  hunter: { kind: SERVICE_KIND.petTrainer, name: "Pet" },
  warlock: { kind: SERVICE_KIND.demonTrainer, name: "Demon" },
};
