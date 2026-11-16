import { createInstanceDropDecoder } from "@/games/wow-forever/data/instanceDropDecode";
import { createSourceLookup } from "@/games/wow-forever/data/sourceDecode";
import { createSpotDecoder } from "@/games/wow-forever/data/spotDecode";
import type { ClassicItemShardFile } from "@/games/wow-forever/types/itemPages/classicItemShardFile";
import type { ItemPageSources } from "@/games/wow-forever/types/itemPages/itemPageSources";
import type { ItemQuest } from "@/games/wow-forever/types/itemPages/itemQuest";

/** "cmangos/classic-db@ec4f596" for the footnote. */
export function classicSourceName(file: Pick<ClassicItemShardFile, "source">): string {
  return `${file.source.repo}@${file.source.commit.slice(0, 7)}`;
}

/**
 * One item's Classic sources from its shard. Vendors, open-world drops and
 * containers decode with the food pages' decoder; quests keep their level to
 * pick up and class; dungeon / raid drops get their instance.
 */
export function decodeClassicItem(file: ClassicItemShardFile, itemId: number): ItemPageSources {
  const raw = file.items[String(itemId)];
  const lookup = createSourceLookup({
    source: classicSourceName(file),
    zones: file.zones,
    territory: file.territory,
    quests: file.quests,
    recipes: {},
    reagents: raw ? { [String(itemId)]: raw } : {},
  });
  const instanceDrops = createInstanceDropDecoder(file.instances, createSpotDecoder(file.zones, file.territory).spotAt);

  const quests = (raw?.quests ?? []).flatMap((id): ItemQuest[] => {
    const quest = lookup.quest(id);
    const row = file.quests[String(id)];
    return quest && row ? [{ ...quest, minLevel: Number(row[5]), classes: String(row[6] ?? "") }] : [];
  });
  return {
    // Quests are listed once, below, with their level to pick up and class.
    sources: { ...lookup.reagent(itemId), quests: [] },
    quests,
    instanceDrops: instanceDrops(raw?.instance),
    moreInstanceDrops: raw?.instance?.more ?? 0,
  };
}
