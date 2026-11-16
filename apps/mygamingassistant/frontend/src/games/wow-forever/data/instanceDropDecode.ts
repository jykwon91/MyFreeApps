import type { SourceCell, SpotDecoder } from "@/games/wow-forever/data/spotDecode";
import type { InstanceDrop } from "@/games/wow-forever/types/itemPages/instanceDrop";
import type { InstanceInfo } from "@/games/wow-forever/types/itemPages/instanceInfo";
import { INSTANCE_KIND } from "@/games/wow-forever/types/itemPages/instanceKind";
import { INSTANCE_MOB_KIND, type InstanceMobKind } from "@/games/wow-forever/types/itemPages/instanceMobKind";
import type { RawInstanceDrop } from "@/games/wow-forever/types/itemPages/rawInstanceDrop";

const MOB_KINDS: readonly string[] = Object.values(INSTANCE_MOB_KIND);

function mobKind(value: SourceCell | undefined): InstanceMobKind {
  const kind = String(value ?? "");
  return MOB_KINDS.includes(kind) ? (kind as InstanceMobKind) : INSTANCE_MOB_KIND.trash;
}

/**
 * Decodes dungeon / raid drop rows against a file's instance table
 * (`[name, type, minLevel, maxLevel, requiredLevel, zone, x, y]` by map id).
 * The item pages' shards and the crafting guides' sources.json share the shape.
 */
export function createInstanceDropDecoder(
  instances: Readonly<Record<string, readonly SourceCell[]>>,
  spotAt: SpotDecoder["spotAt"],
): (raw: RawInstanceDrop | undefined) => InstanceDrop[] {
  function instance(id: number): InstanceInfo | null {
    const row = instances[String(id)];
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

  return (raw) =>
    (raw?.mobs ?? []).flatMap((row): InstanceDrop[] => {
      const [name, minLevel, maxLevel, chance, instanceId, kind] = row;
      const info = instance(Number(instanceId));
      if (!info) return [];
      return [{ name: String(name), minLevel: Number(minLevel), maxLevel: Number(maxLevel), chance: Number(chance), kind: mobKind(kind), instance: info }];
    });
}
