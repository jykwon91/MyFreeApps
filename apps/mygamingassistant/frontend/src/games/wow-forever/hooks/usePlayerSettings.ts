import { useSyncExternalStore } from "react";
import { findClass, type WowClassId } from "@/games/wow-forever/data/classes";
import { MAX_LEVEL, playerLevel } from "@/games/wow-forever/data/levelCap";
import { readStored, writeStored } from "@/games/wow-forever/lib/safeLocalStorage";
import { FACTION, type PlayerFaction } from "@/games/wow-forever/types/worldMap";

export const PLAYER_SETTINGS_STORAGE_KEY = "mga.wowForever.worldMap.player.v1";

/** Who the player is and where they stand. Remembered between visits. */
export interface PlayerSettings {
  faction: PlayerFaction;
  classId: WowClassId;
  zoneId: number | null;
  level: number | null;
  /** Map percent on `zoneId`; null = the middle of the zone until they say otherwise. */
  position: { x: number; y: number } | null;
}

export const DEFAULT_PLAYER_SETTINGS: PlayerSettings = {
  faction: FACTION.alliance,
  classId: "warlock",
  zoneId: null,
  level: null,
  position: null,
};

function isPercent(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100;
}

/** Accept a stored value only if every field is still valid. */
export function parsePlayerSettings(raw: unknown): PlayerSettings | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const faction = [FACTION.alliance, FACTION.horde].find((f) => f === r.faction);
  const cls = typeof r.classId === "string" ? findClass(r.classId) : undefined;
  if (!faction || !cls) return null;
  let zoneId: number | null = null;
  if (typeof r.zoneId === "number" && Number.isInteger(r.zoneId)) zoneId = r.zoneId;
  let level: number | null = null;
  if (typeof r.level === "number" && Number.isInteger(r.level) && r.level >= 1 && r.level <= MAX_LEVEL) level = playerLevel(r.level);
  let position: PlayerSettings["position"] = null;
  const p = r.position as Record<string, unknown> | null | undefined;
  if (zoneId !== null && p && isPercent(p.x) && isPercent(p.y)) position = { x: p.x, y: p.y };
  return { faction, classId: cls.id, zoneId, level, position };
}

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(PLAYER_SETTINGS_STORAGE_KEY);
  } catch {
    return null;
  }
}

interface Snapshot {
  /** The stored string this value was read from (or couldn't replace). */
  raw: string | null;
  value: PlayerSettings;
}

// One store for every caller, so a change on one part of a page (the auction
// house's faction switch) reaches every other part (the prices it shows).
// The snapshot is cached by the stored string, so it stays the same object
// until storage changes; `unsaved` keeps a change storage refused to save.
let cached: Snapshot | null = null;
let unsaved: Snapshot | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

function onStorage(event: StorageEvent): void {
  if (event.key === null || event.key === PLAYER_SETTINGS_STORAGE_KEY) notify();
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) window.addEventListener("storage", onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): PlayerSettings {
  const raw = readRaw();
  if (unsaved && unsaved.raw === raw) return unsaved.value;
  unsaved = null;
  if (!cached || cached.raw !== raw) {
    cached = { raw, value: readStored(PLAYER_SETTINGS_STORAGE_KEY, parsePlayerSettings, DEFAULT_PLAYER_SETTINGS) };
  }
  return cached.value;
}

function updatePlayerSettings(patch: Partial<PlayerSettings>): void {
  const prev = getSnapshot();
  const next = { ...prev, ...patch };
  // A new zone means the old position (map percent on the old zone) is meaningless.
  if (patch.zoneId !== undefined && patch.zoneId !== prev.zoneId && patch.position === undefined) {
    next.position = null;
  }
  writeStored(PLAYER_SETTINGS_STORAGE_KEY, next);
  const raw = readRaw();
  // Keep `next` itself as the snapshot (not a re-parse of storage), so callers
  // that compare what they just set by identity (the World Map's position) see it.
  if (raw === JSON.stringify(next)) {
    cached = { raw, value: next };
    unsaved = null;
  } else {
    unsaved = { raw, value: next };
  }
  notify();
}

export function usePlayerSettings(): [PlayerSettings, (patch: Partial<PlayerSettings>) => void] {
  const settings = useSyncExternalStore(subscribe, getSnapshot);
  return [settings, updatePlayerSettings];
}
