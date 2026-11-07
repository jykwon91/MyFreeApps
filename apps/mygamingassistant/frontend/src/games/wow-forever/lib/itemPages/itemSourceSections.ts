import { questsFor } from "@/games/wow-forever/food/recipeSources";
import type { ItemPage } from "@/games/wow-forever/types/itemPages/itemPage";
import type { InstanceDrop } from "@/games/wow-forever/types/itemPages/instanceDrop";
import { INSTANCE_KIND } from "@/games/wow-forever/types/itemPages/instanceKind";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

export const ITEM_SOURCE_SECTION = {
  vendor: "vendor",
  quest: "quest",
  dungeon: "dungeon",
  crafted: "crafted",
  drop: "drop",
  container: "container",
  raid: "raid",
} as const;
export type ItemSourceSection = (typeof ITEM_SOURCE_SECTION)[keyof typeof ITEM_SOURCE_SECTION];

/** Drops inside dungeons, and inside raids (not open yet, so always listed last). */
export function splitInstanceDrops(drops: readonly InstanceDrop[]): { dungeon: InstanceDrop[]; raid: InstanceDrop[] } {
  return {
    dungeon: drops.filter((d) => d.instance.kind === INSTANCE_KIND.dungeon),
    raid: drops.filter((d) => d.instance.kind === INSTANCE_KIND.raid),
  };
}

/**
 * The ways to get it, most practical first: buy it, a quest your faction can
 * do, a dungeon boss, craft it, open-world mobs, containers — then quests only
 * the other faction gets, and raids last (not open yet).
 */
export function itemSourceSections(page: ItemPage, faction: PlayerFaction): ItemSourceSection[] {
  const { sources, quests, instanceDrops } = page.sources;
  const { dungeon, raid } = splitInstanceDrops(instanceDrops);
  const yourQuests = questsFor(quests, faction).length > 0;
  const sections: [ItemSourceSection, boolean][] = [
    [ITEM_SOURCE_SECTION.vendor, sources.vendors.length > 0],
    [ITEM_SOURCE_SECTION.quest, yourQuests],
    [ITEM_SOURCE_SECTION.dungeon, dungeon.length > 0],
    [ITEM_SOURCE_SECTION.crafted, page.facts.crafted.length > 0],
    [ITEM_SOURCE_SECTION.drop, sources.drop !== null],
    [ITEM_SOURCE_SECTION.container, sources.containers.length + sources.objectSpots.length + sources.containerDrops.length > 0],
    [ITEM_SOURCE_SECTION.quest, quests.length > 0 && !yourQuests],
    [ITEM_SOURCE_SECTION.raid, raid.length > 0],
  ];
  return sections.filter(([, shown]) => shown).map(([section]) => section);
}
