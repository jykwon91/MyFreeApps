/**
 * The rares finder's data from the generator's two files: every Classic rare
 * with its name, rank, level, spawns and drops (`rares/classic/rareSpawns.json`),
 * and the rares the Forever client has met, with Forever's name and
 * classification (`rares/rares.json`, which also names the drop items and zones).
 */
import { isItemSlot } from "@/games/wow-forever/data/itemSlots";
import { RARE_CLASSIFICATION_CODE } from "@/games/wow-forever/data/rares/raresConfig";
import { columnIndexes } from "@/games/wow-forever/lib/dungeons/columnIndexes";
import type { BossLootItem } from "@/games/wow-forever/types/dungeons/bossLootItem";
import type { Rare } from "@/games/wow-forever/types/rares/rare";
import type { RareDataFiles } from "@/games/wow-forever/types/rares/rareDataFiles";
import type { RaresData } from "@/games/wow-forever/types/rares/raresData";
import type { RareSpawn } from "@/games/wow-forever/types/rares/rareSpawn";

function dropItems(files: RareDataFiles, drops: readonly (readonly number[])[]): BossLootItem[] {
  const { forever, classic } = files;
  const item = columnIndexes("rares.json", forever.itemColumns, ["name", "slot", "itemType"] as const);
  const drop = columnIndexes("rareSpawns.json", classic.dropColumns, ["item", "chance"] as const);
  return drops.flatMap((row) => {
    const info = forever.items[String(row[drop.item])];
    if (!info) return [];
    const slot = String(info[item.slot] ?? "");
    const itemType = info[item.itemType];
    return [
      {
        id: row[drop.item],
        name: String(info[item.name]),
        slot: isItemSlot(slot) ? slot : null,
        itemType: typeof itemType === "string" ? itemType : null,
        chance: row[drop.chance],
      },
    ];
  });
}

function spawns(files: RareDataFiles, rows: readonly (readonly (string | number)[])[]): RareSpawn[] {
  const col = columnIndexes("rareSpawns.json", files.classic.spawnColumns, ["zone", "subzone", "x", "y"] as const);
  return rows.map((row) => {
    const zoneId = Number(row[col.zone]);
    return {
      zoneId,
      zoneName: files.forever.zones[String(zoneId)] ?? "",
      subzone: String(row[col.subzone]),
      x: Number(row[col.x]),
      y: Number(row[col.y]),
    };
  });
}

/** Lowest level first; a rare with no level last; then by name. */
export function compareRares(a: Rare, b: Rare): number {
  const levelA = a.minLevel ?? Number.POSITIVE_INFINITY;
  const levelB = b.minLevel ?? Number.POSITIVE_INFINITY;
  if (levelA !== levelB) return levelA < levelB ? -1 : 1;
  return a.name.localeCompare(b.name);
}

interface RareIdentity {
  name: string;
  classificationCode: number;
}

/** Creature id -> Forever's name and classification, for every rare the client has met. */
function confirmedRares(files: RareDataFiles): Map<number, RareIdentity> {
  const col = columnIndexes("rares.json", files.forever.columns, ["id", "name", "classification"] as const);
  return new Map(
    files.forever.rares.map((row) => [
      Number(row[col.id]),
      { name: String(row[col.name]), classificationCode: Number(row[col.classification]) },
    ]),
  );
}

export function decodeRares(files: RareDataFiles): RaresData {
  const confirmed = confirmedRares(files);
  const ids = new Set([...confirmed.keys(), ...Object.keys(files.classic.rares).map(Number)]);
  const rares: Rare[] = [...ids].flatMap((id) => {
    const classic = files.classic.rares[String(id)];
    const forever = confirmed.get(id);
    const identity = forever ?? (classic ? { name: classic.name, classificationCode: classic.classification } : undefined);
    const classification = identity ? RARE_CLASSIFICATION_CODE[identity.classificationCode] : undefined;
    if (!identity || !classification) return [];
    return [
      {
        id,
        name: identity.name,
        classification,
        classic: classic !== undefined,
        seenOn: forever ? files.forever.seenOn : null,
        minLevel: classic?.minLevel ?? null,
        maxLevel: classic?.maxLevel ?? null,
        spawns: classic ? spawns(files, classic.spawns) : [],
        drops: classic ? dropItems(files, classic.drops) : [],
      },
    ];
  });
  const zones = Object.entries(files.forever.zones)
    .map(([id, name]) => ({ id: Number(id), name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { rares: rares.sort(compareRares), zones, seenOn: files.forever.seenOn, clientBuild: files.forever.clientBuild };
}
