import { MAP_KEYBOARD_PAN_PX } from "@/games/wow-forever/data/worldMap/mapViewer";
import type { MapViewKey } from "@/games/wow-forever/types/mapViewKey";

/** Keys the focused map pans (arrows) and zooms (+ / −, with or without Shift) with. */
export const MAP_VIEW_KEYS: ReadonlyMap<string, MapViewKey> = new Map<string, MapViewKey>([
  ["ArrowUp", { kind: "pan", dx: 0, dy: -MAP_KEYBOARD_PAN_PX }],
  ["ArrowDown", { kind: "pan", dx: 0, dy: MAP_KEYBOARD_PAN_PX }],
  ["ArrowLeft", { kind: "pan", dx: -MAP_KEYBOARD_PAN_PX, dy: 0 }],
  ["ArrowRight", { kind: "pan", dx: MAP_KEYBOARD_PAN_PX, dy: 0 }],
  ["+", { kind: "zoom", steps: 1 }],
  ["=", { kind: "zoom", steps: 1 }],
  ["-", { kind: "zoom", steps: -1 }],
  ["_", { kind: "zoom", steps: -1 }],
]);
