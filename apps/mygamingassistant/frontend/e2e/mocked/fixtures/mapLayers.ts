/**
 * The World Map's saved layer choice (`MAP_LAYERS_STORAGE_KEY`), for specs that need the map clear of
 * layer markers — a test that clicks a zone's own ground would otherwise hit a flight master or trainer there.
 */
import type { Page } from "@playwright/test";
import { MAP_LAYER_IDS } from "../../../src/games/wow-forever/data/worldMap/mapLayerIds";

export const MAP_LAYERS_KEY = "mga.wowForever.worldMap.layers.v1";

/** Every layer off before the page loads (set on each navigation, so set it before the first goto). */
export async function hideMapLayers(page: Page) {
  const layers = Object.fromEntries(MAP_LAYER_IDS.map((id) => [id, false]));
  await page.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [MAP_LAYERS_KEY, JSON.stringify({ layers, levelFit: true })] as const);
}
