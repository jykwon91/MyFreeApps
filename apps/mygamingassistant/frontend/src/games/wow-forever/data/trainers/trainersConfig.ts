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
  /** After the toggle, with a character: how many of the rank's recipes they can learn, or that they know them all. */
  canLearn: (count: number) => ` · ${count} you can learn`,
  allKnown: " · all known",
  loading: (rank: string) => `What ${rank} teaches · loading…`,
  listLabel: (rank: string) => `Recipes ${rank} trainers teach`,
  error: "Couldn't load what the trainers teach.",
  /** At most this many of your faction's trainers teach a recipe → name them under it. */
  onlyFromMax: 2,
  onlyFrom: "Only from",
  onlyFromLabel: "Trainers who teach it",
  noTeacher: (faction: string) => `No ${faction} trainer teaches it in our data (Classic).`,
  /** Under a crafting profession's trainer list: the names open that trainer's own list. */
  trainerHint: "Click a trainer's name to see everything they teach.",
} as const;

/** The single-trainer panel's "N of M learnable now" line. */
export const TRAINER_PANEL_COPY = {
  all: (count: number) => `All ${count} learnable now`,
  some: (count: number, of: number) => `${count} of ${of} learnable now`,
  none: "None learnable yet",
  allKnown: "You know all of these",
} as const;

/** The line saying whose character marks the recipes, and each row's status chip. */
export const MY_PROFESSION_COPY = {
  ready: (name: string, profession: string, skill: number, maxSkill: number) =>
    `Marked for ${name}: ${profession} ${skill}/${maxSkill}`,
  asOf: (when: string) => `From their last log out, ${when}.`,
  otherFaction: (name: string, theirs: string, page: string) =>
    `${name} is ${theirs}, so only recipes they know are marked — these are ${page} trainers.`,
  change: "Change character",
  none: "Pick your character to mark which recipes you know and can learn.",
  pick: "Pick character",
  notLearned: (name: string, profession: string) => `${name} hasn't learned ${profession}. These are what a new ${profession} learner can train.`,
  error: "Couldn't load your character.",
  loading: "Loading your character…",
  characterPath: "/wow-forever/character",
  known: "Known",
  canLearn: "Can learn",
  needs: (skill: number) => `Needs skill ${skill}`,
} as const;

/** Trainers a class visits besides its own class trainer. */
export const CLASS_EXTRA_TRAINERS: Readonly<Partial<Record<WowClassId, ClassExtraTrainer>>> = {
  hunter: { kind: SERVICE_KIND.petTrainer, name: "Pet" },
  warlock: { kind: SERVICE_KIND.demonTrainer, name: "Demon" },
};
