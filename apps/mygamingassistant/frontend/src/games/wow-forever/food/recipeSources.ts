/**
 * Turns a food's sources (recipe + reagents) into what the detail page says:
 * who to see first, the one-line "Get it", the skill line and map links.
 */
import { FACTION, TERRITORY, type Faction, type PlayerFaction, type Territory } from "@/games/wow-forever/types/worldMap";
import { ENDPOINT_KIND, formatEndpoint } from "@/games/wow-forever/worldMap/trip";
import type { FoodRecord } from "@/games/wow-forever/types/food";
import type { DropMob, DropSource, ItemSources, MobSpot, VendorSpot } from "@/games/wow-forever/types/recipeSources";

/** Classic item ids stop well below this; Forever's new items start far above it. */
export const FIRST_FOREVER_ITEM_ID = 100_000;

/** An item new in Forever — so no Classic source data exists for it. */
export function isNewInForever(itemId: number): boolean {
  return itemId >= FIRST_FOREVER_ITEM_ID;
}

/** What to say when nothing is known about where an item comes from. */
export function unknownSource(itemId: number, what: string): string {
  if (isNewInForever(itemId)) return `New in Forever — where to get ${what} isn't known yet.`;
  return `Where to get ${what} isn't in the Classic data (it may be a holiday, dungeon or class-quest item).`;
}

/** Drops rarer than this read as "Rare drop" rather than a chance to farm. */
export const RARE_DROP_PERCENT = 1;

/** Vendors the player can use, and the other faction's (shown on request). */
export interface VendorSplit {
  yours: VendorSpot[];
  other: VendorSpot[];
}

/**
 * Your faction's and neutral vendors first — in your zone first — then the
 * other faction's apart, since you can't buy from them.
 */
export function splitVendors(vendors: readonly VendorSpot[], faction: PlayerFaction, zoneId: number | null): VendorSplit {
  const rank = (v: VendorSpot) => (v.zoneId === zoneId ? 0 : 2) + (v.faction === faction ? 0 : 1);
  const yours = vendors.filter((v) => v.faction === faction || v.faction === FACTION.neutral);
  return {
    yours: [...yours].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name)),
    other: vendors.filter((v) => v.faction !== faction && v.faction !== FACTION.neutral),
  };
}

/** Quests for your faction or both. */
export function questsFor<T extends { side: Faction }>(quests: readonly T[], faction: PlayerFaction): T[] {
  return quests.filter((q) => q.side === faction || q.side === FACTION.neutral);
}

/** "Stormwind City" / "Goldshire, Elwynn Forest". */
export function placeLabel(spot: { subzone: string; zoneName: string }): string {
  return spot.subzone ? `${spot.subzone}, ${spot.zoneName}` : spot.zoneName;
}

const MINUTES_PER_HOUR = 60;

/** "2 hours" / "1 hour" / "30 minutes". */
function duration(minutes: number): string {
  if (minutes < MINUTES_PER_HOUR) return `${minutes} minutes`;
  const hours = Math.round(minutes / MINUTES_PER_HOUR);
  return hours === 1 ? "1 hour" : `${hours} hours`;
}

/** "2 at a time" — what a limited vendor holds. */
export function stockSize(vendor: Pick<VendorSpot, "stock">): string {
  return `${vendor.stock} at a time`;
}

/** "2 at a time · restocks about every 2 hours". */
export function stockLabel(vendor: Pick<VendorSpot, "stock" | "restockMinutes">): string {
  if (!vendor.restockMinutes) return stockSize(vendor);
  return `${stockSize(vendor)} · restocks about every ${duration(vendor.restockMinutes)}`;
}

/** Shown under a vendor list with limited stock — why the item may be missing from the vendor's window. */
export const SHARED_STOCK_NOTE =
  "Limited stock is shared with every player on your realm. If it's not on the vendor's list, someone bought it — come back after the restock.";

/** The World Map with directions open, to a spot. */
export function directionsHref(spot: { zoneId: number; x: number; y: number }): string {
  const to = formatEndpoint({ kind: ENDPOINT_KIND.point, zoneId: spot.zoneId, x: spot.x, y: spot.y });
  return `/wow-forever/map?to=${encodeURIComponent(to)}&dir=1`;
}

/** "level 5–45" / "level 60". */
export function levelRange([lo, hi]: readonly [number, number]): string {
  return lo === hi ? `level ${lo}` : `level ${lo}–${hi}`;
}

function bestChance(drop: DropSource): number {
  return Math.max(0, ...drop.mobs.map((m) => m.chance));
}

/** A drop with no mob worth farming for it. */
export function isRareDrop(drop: DropSource): boolean {
  return drop.world || bestChance(drop) < RARE_DROP_PERCENT;
}

/** This many kinds of mob dropping it = "drops from mobs level X–Y", not a mob to farm (cloth). */
export const COMMON_DROP_MOBS = 50;

/** Cloth and the like: hundreds of mobs drop it, so its mobs are a farm spot per zone. */
export function isCommonDrop(drop: DropSource): boolean {
  return !drop.world && drop.mobs.length + drop.more >= COMMON_DROP_MOBS;
}

/** "595 kinds of mobs drop it, level 14–60. The best one to farm in each zone:" */
export function describeCommonDrop(drop: DropSource): string {
  return `${drop.mobs.length + drop.more} kinds of mobs drop it, ${levelRange(drop.levels)}. The best one to farm in each zone:`;
}

const HOSTILE_TERRITORY: Record<PlayerFaction, Territory> = {
  [FACTION.alliance]: TERRITORY.horde,
  [FACTION.horde]: TERRITORY.alliance,
};

/** The other faction's zone — farmable, but their guards and players are about. */
export function isHostileGround(spot: Pick<MobSpot, "territory">, faction: PlayerFaction): boolean {
  return spot.territory === HOSTILE_TERRITORY[faction];
}

/** "Horde territory" for a spot on the other faction's ground, else "". */
export function hostileGroundLabel(spot: Pick<MobSpot, "territory">, faction: PlayerFaction): string {
  if (!isHostileGround(spot, faction)) return "";
  return faction === FACTION.alliance ? "Horde territory" : "Alliance territory";
}

/** Your zone, then your faction's zones, contested ones, the other faction's last. */
function groundRank(spot: MobSpot | null, faction: PlayerFaction, zoneId: number | null): number {
  if (!spot) return 4;
  if (spot.zoneId === zoneId) return 0;
  if (spot.territory === TERRITORY.contested || spot.territory === null) return 2;
  return isHostileGround(spot, faction) ? 3 : 1;
}

/**
 * Farm spots for a common drop, the closest-to-home and lowest-level first.
 * With a level, the spots you can farm come first (closest to home, then the
 * best drop chance), then the ones too high for you, lowest level first.
 */
export function farmSpots(drop: DropSource, faction: PlayerFaction, zoneId: number | null, level: number | null = null): DropMob[] {
  const rank = (m: DropMob) => groundRank(m.spot, faction, zoneId);
  const byName = (a: DropMob, b: DropMob) => a.name.localeCompare(b.name);
  if (level === null) return [...drop.mobs].sort((a, b) => rank(a) - rank(b) || a.minLevel - b.minLevel || byName(a, b));
  const farmable = drop.mobs.filter((m) => canFarm(m, level));
  const tooHigh = drop.mobs.filter((m) => !canFarm(m, level));
  farmable.sort((a, b) => rank(a) - rank(b) || b.chance - a.chance || byName(a, b));
  tooHigh.sort((a, b) => a.minLevel - b.minLevel || rank(a) - rank(b) || byName(a, b));
  return [...farmable, ...tooHigh];
}

/** "World drop from mobs level 10–30, mostly in The Barrens" / "Rare drop …". */
export function describeRareDrop(drop: DropSource): string {
  const what = drop.world ? "World drop" : "Rare drop";
  const where = drop.zones.length ? `, mostly in ${drop.zones.join(", ")}` : "";
  return `${what} from mobs ${levelRange(drop.levels)}${where}`;
}

/** Mobs up to this many levels above you still go down fast enough to farm. */
export const FARM_LEVELS_ABOVE = 2;

/** A mob you can farm at this level: grey and green ones too — they die faster. */
export function canFarm(mob: Pick<DropMob, "maxLevel">, level: number): boolean {
  return mob.maxLevel <= level + FARM_LEVELS_ABOVE;
}

/** A drop's mobs in the order to farm them, each saying whether it's beyond the level. */
export interface RankedMob {
  mob: DropMob;
  tooHigh: boolean;
}

/**
 * With a level: the mobs you can farm, best drop chance first, then the ones
 * too high for you yet, lowest level first. Without: the data's order (chance
 * x how many there are).
 */
export function mobsForLevel(mobs: readonly DropMob[], level: number | null): RankedMob[] {
  if (level === null) return mobs.map((mob) => ({ mob, tooHigh: false }));
  const farmable = mobs.filter((m) => canFarm(m, level));
  const tooHigh = mobs.filter((m) => !canFarm(m, level));
  farmable.sort((a, b) => b.chance - a.chance || a.minLevel - b.minLevel || a.name.localeCompare(b.name));
  tooHigh.sort((a, b) => a.minLevel - b.minLevel || b.chance - a.chance || a.name.localeCompare(b.name));
  return [...farmable.map((mob) => ({ mob, tooHigh: false })), ...tooHigh.map((mob) => ({ mob, tooHigh: true }))];
}

/** "Fleshripper (level 16–17) · 55%". */
export function describeMob(mob: { name: string; minLevel: number; maxLevel: number; chance: number }): string {
  return `${mob.name} (${levelRange([mob.minLevel, mob.maxLevel])}) · ${mob.chance}%`;
}

/** Cooking skill line: "Cooking 75 to learn · green at 115 · grey at 155". */
export function skillLine(learnAt: number | null, greenAt: number | null, greyAt: number | null): string {
  const parts = [learnAt === null ? "Any Cooking skill" : `Cooking ${learnAt} to learn`];
  // The colours only mean something above the learn skill.
  const sane = greyAt !== null && (learnAt === null || greyAt > learnAt);
  if (sane && greenAt !== null && greenAt > (learnAt ?? 0)) parts.push(`green at ${greenAt}`);
  if (sane) parts.push(`grey at ${greyAt}`);
  return parts.join(" · ");
}

/** Anything known about the recipe (or reagent) at all. */
export function hasSources(s: ItemSources): boolean {
  const lists = s.vendors.length + s.quests.length + s.fishing.length + s.containers.length;
  return lists > 0 || s.drop !== null || s.skinning !== null || s.disenchant !== null;
}

/** The one-line answer to "how do I get this recipe?" for the page header. */
export function getItSummary(food: FoodRecord, sources: ItemSources, faction: PlayerFaction, zoneId: number | null): string {
  if (food.learn.source === "trainer") return "Learn it from any Cooking trainer.";
  const vendor = splitVendors(sources.vendors, faction, zoneId).yours[0];
  if (vendor) return `Buy the recipe from ${vendor.name} in ${placeLabel(vendor)}.`;
  const quest = questsFor(sources.quests, faction)[0];
  if (quest) return `The recipe is a reward from the quest “${quest.title}”.`;
  if (sources.drop && isRareDrop(sources.drop)) return `${describeRareDrop(sources.drop)}.`;
  if (sources.drop) return `The recipe drops from ${sources.drop.mobs[0]?.name ?? "mobs"}.`;
  if (sources.containers.length) return `The recipe is found in ${sources.containers.join(", ")}.`;
  if (sources.vendors.length) return "Only the other faction's vendors sell the recipe.";
  return unknownSource(food.learn.recipeItem ?? food.id, "the recipe");
}
