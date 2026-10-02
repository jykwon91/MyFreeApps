/**
 * Where to farm gold at a level, from the generated Classic loot tables
 * (`data/gold/classic/goldFarms.json`, built by `scripts/wow_gold/build.py`).
 *
 * Gold an hour is the vendor floor: coin plus what everything sells to a
 * vendor for, times kills an hour. Cloth, greens and leather sell for more to
 * players — those are counted, not priced.
 */
import goldFarmsJson from "@/games/wow-forever/data/gold/classic/goldFarms.json";

export interface GoldFarm {
  npcId: number;
  name: string;
  minLevel: number;
  maxLevel: number;
  type: string;
  zoneId: number;
  zone: string;
  subzone: string;
  x: number;
  y: number;
  /** How many of it stand within a minute's walk. */
  pack: number;
  respawnSec: number;
  /** Copper a kill: coin, and loot at vendor price. */
  coin: number;
  vendor: number;
  killsPerHour: number;
  cloth: string;
  clothPerKill: number;
  greensPerKill: number;
  bluesPerKill: number;
  recipesPerKill: number;
  /** What Skinning gives ("" when it can't be skinned), and its vendor value in copper. */
  skin: string;
  skinVendor: number;
}

interface GoldFarmsFile {
  columns: readonly string[];
  zones: Readonly<Record<string, string>>;
  farms: readonly (readonly (string | number)[])[];
}

export const FARM_SORT = { gold: "gold", cloth: "cloth" } as const;
export type FarmSort = (typeof FARM_SORT)[keyof typeof FARM_SORT];

/** Mobs from 3 levels under you to 1 over: they die fast and still give experience. */
export const LEVELS_BELOW = 3;
export const LEVELS_ABOVE = 1;
export const FARMS_SHOWN = 5;

export function decodeGoldFarms(file: GoldFarmsFile): GoldFarm[] {
  return file.farms.map((row) => {
    const r = Object.fromEntries(file.columns.map((c, i) => [c, row[i]]));
    const zoneId = Number(r.zone);
    return {
      npcId: Number(r.npcId),
      name: String(r.name),
      minLevel: Number(r.minLevel),
      maxLevel: Number(r.maxLevel),
      type: String(r.type),
      zoneId,
      zone: file.zones[String(zoneId)] ?? "",
      subzone: String(r.subzone),
      x: Number(r.x),
      y: Number(r.y),
      pack: Number(r.pack),
      respawnSec: Number(r.respawnSec),
      coin: Number(r.coin),
      vendor: Number(r.vendor),
      killsPerHour: Number(r.killsPerHour),
      cloth: String(r.cloth),
      clothPerKill: Number(r.clothPerKill),
      greensPerKill: Number(r.greensPerKill),
      bluesPerKill: Number(r.bluesPerKill),
      recipesPerKill: Number(r.recipesPerKill),
      skin: String(r.skin),
      skinVendor: Number(r.skinVendor),
    };
  });
}

let decoded: GoldFarm[] | null = null;

export function goldFarms(): readonly GoldFarm[] {
  decoded ??= decodeGoldFarms(goldFarmsJson as unknown as GoldFarmsFile);
  return decoded;
}

/** Copper an hour at vendor prices; Skinning adds the leather. */
export function goldPerHour(farm: GoldFarm, skinning: boolean): number {
  const skin = skinning ? farm.skinVendor : 0;
  return (farm.coin + farm.vendor + skin) * farm.killsPerHour;
}

export function clothPerHour(farm: GoldFarm): number {
  return farm.clothPerKill * farm.killsPerHour;
}

/** The best places at a level, one mob per place. */
export function farmsFor(
  farms: readonly GoldFarm[],
  level: number,
  { skinning, sort }: { skinning: boolean; sort: FarmSort },
): GoldFarm[] {
  const score = (f: GoldFarm) => (sort === FARM_SORT.cloth ? clothPerHour(f) : goldPerHour(f, skinning));
  const fits = farms.filter((f) => f.maxLevel >= level - LEVELS_BELOW && f.minLevel <= level + LEVELS_ABOVE && score(f) > 0);
  fits.sort((a, b) => score(b) - score(a) || a.npcId - b.npcId);
  const places = new Set<string>();
  const out: GoldFarm[] = [];
  for (const f of fits) {
    const place = `${f.zoneId}:${f.subzone || f.npcId}`;
    if (places.has(place)) continue;
    places.add(place);
    out.push(f);
    if (out.length === FARMS_SHOWN) break;
  }
  return out;
}

/** "12g 40s", "3s 20c", "45c" — rounded to the two biggest coins. */
export function formatMoney(copper: number): string {
  const c = Math.round(copper);
  if (c >= 10000) {
    const silver = Math.round(c / 100);
    const g = Math.floor(silver / 100);
    const s = silver % 100;
    return s ? `${g}g ${s}s` : `${g}g`;
  }
  if (c >= 100) {
    const s = Math.floor(c / 100);
    const rest = c % 100;
    return rest ? `${s}s ${rest}c` : `${s}s`;
  }
  return `${c}c`;
}

/** "1 every 40 kills" — or null when it's rarer than one an hour's farming would show. */
export function oneEvery(perKill: number): string | null {
  if (perKill <= 0) return null;
  const every = Math.round(1 / perKill);
  if (every > 300) return null;
  return every <= 1 ? "about 1 a kill" : `about 1 every ${every} kills`;
}

export function levelLabel(farm: GoldFarm): string {
  return farm.minLevel === farm.maxLevel ? `level ${farm.minLevel}` : `level ${farm.minLevel}–${farm.maxLevel}`;
}
