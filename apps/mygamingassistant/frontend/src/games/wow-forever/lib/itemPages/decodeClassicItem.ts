import { createSourceLookup } from "@/games/wow-forever/data/sourceDecode";
import { createSpotDecoder, type SourceCell } from "@/games/wow-forever/data/spotDecode";
import type { ClassicItemShardFile } from "@/games/wow-forever/types/itemPages/classicItemShardFile";
import type { InstanceDrop } from "@/games/wow-forever/types/itemPages/instanceDrop";
import type { InstanceInfo } from "@/games/wow-forever/types/itemPages/instanceInfo";
import { INSTANCE_KIND } from "@/games/wow-forever/types/itemPages/instanceKind";
import { INSTANCE_MOB_KIND, type InstanceMobKind } from "@/games/wow-forever/types/itemPages/instanceMobKind";
import type { ItemPageSources } from "@/games/wow-forever/types/itemPages/itemPageSources";
import type { ItemQuest } from "@/games/wow-forever/types/itemPages/itemQuest";

const MOB_KINDS: readonly string[] = Object.values(INSTANCE_MOB_KIND);

function mobKind(value: SourceCell | undefined): InstanceMobKind {
  const kind = String(value ?? "");
  return MOB_KINDS.includes(kind) ? (kind as InstanceMobKind) : INSTANCE_MOB_KIND.trash;
}

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
  const { spotAt } = createSpotDecoder(file.zones, file.territory);

  function instance(id: number): InstanceInfo | null {
    const row = file.instances[String(id)];
    if (!row) return null;
    const [name, type, , maxLevel, requiredLevel, zone, x, y] = row;
    return {
      id,
      name: String(name),
      kind: type === INSTANCE_KIND.raid ? INSTANCE_KIND.raid : INSTANCE_KIND.dungeon,
      maxLevel: Number(maxLevel),
      requiredLevel: Number(requiredLevel),
      entrance: spotAt(zone, "", x, y),
    };
  }

  const quests = (raw?.quests ?? []).flatMap((id): ItemQuest[] => {
    const quest = lookup.quest(id);
    const row = file.quests[String(id)];
    return quest && row ? [{ ...quest, minLevel: Number(row[5]), classes: String(row[6] ?? "") }] : [];
  });
  const instanceDrops = (raw?.instance?.mobs ?? []).flatMap((row): InstanceDrop[] => {
    const [name, minLevel, maxLevel, chance, instanceId, kind] = row;
    const info = instance(Number(instanceId));
    if (!info) return [];
    return [{ name: String(name), minLevel: Number(minLevel), maxLevel: Number(maxLevel), chance: Number(chance), kind: mobKind(kind), instance: info }];
  });
  return {
    // Quests are listed once, below, with their level to pick up and class.
    sources: { ...lookup.reagent(itemId), quests: [] },
    quests,
    instanceDrops,
    moreInstanceDrops: raw?.instance?.more ?? 0,
  };
}
