/**
 * Totals the WoW Forever pages show, counted from the committed game data, so a
 * data refresh (`wow_refresh`) that adds beasts, items, books or changes doesn't
 * break the mocked specs. Counted from the raw JSON, not through the pages' own
 * decoders, so a decoder that drops or doubles rows still fails the spec.
 * Rares and races, which also need their filters counted, have their own files.
 */
import changeIndexJson from "../../../src/games/wow-forever/data/changes/index.json" with { type: "json" };
import changeTalentsJson from "../../../src/games/wow-forever/data/changes/classic/talents.json" with { type: "json" };
import changeZonesJson from "../../../src/games/wow-forever/data/changes/zones.json" with { type: "json" };
import tamableBeastsJson from "../../../src/games/wow-forever/data/hunterPets/classic/tamableBeasts.json" with { type: "json" };
import hunterPetsJson from "../../../src/games/wow-forever/data/hunterPets/hunterPets.json" with { type: "json" };
import itemIndexJson from "../../../src/games/wow-forever/data/items/itemIndex.json" with { type: "json" };
import legacyJson from "../../../src/games/wow-forever/data/legacy/legacy.json" with { type: "json" };
import libraryJson from "../../../src/games/wow-forever/data/library/library.json" with { type: "json" };

function column(columns: readonly string[], name: string, file: string): number {
  const at = columns.indexOf(name);
  if (at < 0) throw new Error(`${file} has no "${name}" column`);
  return at;
}

const seenBeastId = column(hunterPetsJson.seenColumns, "id", "hunterPets.json");
const seenBeastFamily = column(hunterPetsJson.seenColumns, "family", "hunterPets.json");
const classicBeastId = column(tamableBeastsJson.columns, "id", "tamableBeasts.json");
const classicBeastFamily = column(tamableBeastsJson.columns, "family", "tamableBeasts.json");
const classicBeastIds = new Set(tamableBeastsJson.beasts.map((beast) => beast[classicBeastId]));

/** Every Classic tamable beast plus the beasts the Forever client has met that Classic doesn't have. */
export const ALL_BEASTS = new Set([...classicBeastIds, ...hunterPetsJson.seen.map((row) => row[seenBeastId])]).size;

/** The beasts of one family: Classic's, plus the met beasts Classic doesn't have that the client puts in it. */
export function familyBeastCount(familySlug: string): number {
  const family = hunterPetsJson.families.find((candidate) => candidate.slug === familySlug);
  if (!family) throw new Error(`hunterPets.json has no "${familySlug}" family`);
  const classic = tamableBeastsJson.beasts.filter((beast) => beast[classicBeastFamily] === family.id).length;
  const metOnly = hunterPetsJson.seen.filter(
    (row) => !classicBeastIds.has(row[seenBeastId]) && row[seenBeastFamily] === family.id,
  ).length;
  return classic + metOnly;
}

/** Pet families in the hunter pets data. */
export const PET_FAMILIES = hunterPetsJson.families.length;

/** Every item in the item browser's index. */
export const ALL_ITEMS = itemIndexJson.items.length;

/** The Changes feed's current build, and the build before it (null until the second refresh). */
export const CHANGES_BUILD = changeIndexJson.build;
export const CHANGES_PREVIOUS_BUILD: string | null = changeIndexJson.previousBuild;

/** Rows on the Changes feed's Talents tab (its default) with every class. */
export const TALENT_CHANGES = changeTalentsJson.entries.length;

/** Rows on the Changes feed's Zones & maps tab. */
export const ZONE_CHANGES = changeZonesJson.entries.length;

/** Zones & maps rows whose content first appeared in the current build ("since last build"). */
export const ZONES_SINCE_LAST_BUILD = changeZonesJson.entries.filter((entry) => entry.since === CHANGES_BUILD).length;

/** Books and library cards in the Library data. */
export const LIBRARY_BOOKS = libraryJson.books.length;
export const LIBRARY_CARDS = libraryJson.cards.length;

const libraryQuestId = column(libraryJson.questColumns, "id", "library.json");
const libraryQuestRewards = column(libraryJson.questColumns, "rewards", "library.json");
const libraryQuestChoices = column(libraryJson.questColumns, "choices", "library.json");

/** A Library reward quest's items: the choose-one rewards plus the ones you also get. */
export function libraryQuestRewardCount(questId: number): number {
  const quest = libraryJson.quests.find((row) => row[libraryQuestId] === questId);
  if (!quest) throw new Error(`library.json has no reward quest ${questId}`);
  const items = (at: number, name: string): number => {
    const list = quest[at];
    if (!Array.isArray(list)) throw new Error(`library.json quest ${questId} "${name}" column is not a list`);
    return list.length;
  };
  return items(libraryQuestRewards, "rewards") + items(libraryQuestChoices, "choices");
}

/** Every Legacy challenge, across every category and group. */
export const LEGACY_CHALLENGES = legacyJson.categories.reduce(
  (sum, category) => sum + category.groups.reduce((groupSum, group) => groupSum + group.challenges.length, 0),
  0,
);
