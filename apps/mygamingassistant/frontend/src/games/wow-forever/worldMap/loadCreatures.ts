let cached: Promise<unknown> | null = null;

/**
 * `classicCreatures.json` — every other named creature and NPC, as imported. Its own lazy chunk, fetched once the
 * map is on screen, so the World Map's first load doesn't carry it.
 */
export function loadCreatures(): Promise<unknown> {
  if (!cached) {
    cached = import("@/games/wow-forever/data/worldMap/classic/classicCreatures.json").then((file) => file.default);
    // A failed load (offline, bad deploy) must be retryable.
    cached.catch(() => {
      cached = null;
    });
  }
  return cached;
}
