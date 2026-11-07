import { useSyncExternalStore } from "react";
import { MAP_STYLE, MAP_STYLE_STORAGE_KEY } from "@/games/wow-forever/data/worldMap/mapStyle";
import { readStored, writeStored } from "@/games/wow-forever/lib/safeLocalStorage";
import type { MapStyle } from "@/games/wow-forever/types/mapStyle/mapStyle";
import { parseMapStyle } from "@/games/wow-forever/worldMap/mapStyle";

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function read(): MapStyle {
  return readStored(MAP_STYLE_STORAGE_KEY, parseMapStyle, MAP_STYLE.drawn);
}

function setMapStyle(style: MapStyle): void {
  writeStored(MAP_STYLE_STORAGE_KEY, style);
  for (const listener of listeners) listener();
}

/**
 * The player's Map / Satellite choice, saved on this device. It is a
 * preference: a map with no satellite view just shows its drawn art and the
 * choice stays, so the next zone that has one shows it again.
 */
export function useMapStyle(): [MapStyle, (style: MapStyle) => void] {
  const style = useSyncExternalStore(subscribe, read, () => MAP_STYLE.drawn);
  return [style, setMapStyle];
}
