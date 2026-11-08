/**
 * Lightweight map from dungeon instance id → page slug, derived from
 * classicDungeons.json. The slug follows `dungeonSlug(name)` —
 * "/wow-forever/dungeons/deadmines" etc.
 */
import { dungeonSlug } from "@/games/wow-forever/lib/dungeons/dungeonSlug";

interface ClassicDungeonsDoc {
  columns: string[];
  rows: unknown[][];
}

let cached: Promise<ReadonlyMap<number, string>> | null = null;

export function loadDungeonInstanceSlugs(): Promise<ReadonlyMap<number, string>> {
  if (!cached) {
    cached = import("@/games/wow-forever/data/worldMap/classic/classicDungeons.json").then((file) => {
      const doc = file.default as unknown as ClassicDungeonsDoc;
      const atInstance = doc.columns.indexOf("instance");
      const atName = doc.columns.indexOf("name");
      const map = new Map<number, string>();
      for (const row of doc.rows) {
        const instanceId = row[atInstance];
        const name = row[atName];
        if (typeof instanceId === "number" && typeof name === "string") {
          map.set(instanceId, dungeonSlug(name));
        }
      }
      return map;
    });
    cached.catch(() => {
      cached = null;
    });
  }
  return cached;
}
