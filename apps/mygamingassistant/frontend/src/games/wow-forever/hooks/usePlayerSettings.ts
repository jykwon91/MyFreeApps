import { useSyncExternalStore } from "react";
import { findClass, type WowClassId } from "@/games/wow-forever/data/classes";
import { MAX_LEVEL, playerLevel } from "@/games/wow-forever/data/levelCap";
import { characterSlugFromName } from "@/games/wow-forever/lib/character/characterSlug";
import { readStored, writeStored } from "@/games/wow-forever/lib/safeLocalStorage";
import { PLAYER_OVERRIDE_FIELDS } from "@/games/wow-forever/data/character/playerOverrideFields";
import type { PlayerOverrideField } from "@/games/wow-forever/types/character/playerOverrideField";
import { FACTION, type PlayerFaction } from "@/games/wow-forever/types/worldMap";

export const PLAYER_SETTINGS_STORAGE_KEY = "mga.wowForever.worldMap.player.v1";
/** Which of faction / class / level the player typed over the selected character's own. */
export const PLAYER_OVERRIDES_STORAGE_KEY = "mga.wowForever.worldMap.playerOverrides.v1";

/** Who the player is and where they stand. Remembered between visits. */
export interface PlayerSettings {
  faction: PlayerFaction;
  classId: WowClassId;
  zoneId: number | null;
  level: number | null;
  /** Map percent on `zoneId`; null = the middle of the zone until they say otherwise. */
  position: { x: number; y: number } | null;
  /** The character the player set MGA's pages to (its Blizzard slug); the Auction house compares items with its gear. */
  characterSlug: string | null;
}

export const DEFAULT_PLAYER_SETTINGS: PlayerSettings = {
  faction: FACTION.alliance,
  classId: "warlock",
  zoneId: null,
  level: null,
  position: null,
  characterSlug: null,
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
  // Absent in values saved before characters could be remembered: that reads as "none".
  const characterSlug = typeof r.characterSlug === "string" ? characterSlugFromName(r.characterSlug) : null;
  return { faction, classId: cls.id, zoneId, level, position, characterSlug };
}

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(PLAYER_SETTINGS_STORAGE_KEY);
  } catch {
    return null;
  }
}

interface Snapshot<T = PlayerSettings> {
  /** The stored string this value was read from (or couldn't replace). */
  raw: string | null;
  value: T;
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
  if (event.key === null || event.key === PLAYER_SETTINGS_STORAGE_KEY || event.key === PLAYER_OVERRIDES_STORAGE_KEY) notify();
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

function parseOverrides(raw: unknown): PlayerOverrideField[] | null {
  if (!Array.isArray(raw)) return null;
  return PLAYER_OVERRIDE_FIELDS.filter((field) => raw.includes(field));
}

const NO_OVERRIDES: readonly PlayerOverrideField[] = [];
let overridesCache: Snapshot<readonly PlayerOverrideField[]> | null = null;
let overridesUnsaved: Snapshot<readonly PlayerOverrideField[]> | null = null;

function readOverridesRaw(): string | null {
  try {
    return window.localStorage.getItem(PLAYER_OVERRIDES_STORAGE_KEY);
  } catch {
    return null;
  }
}

function getOverridesSnapshot(): readonly PlayerOverrideField[] {
  const raw = readOverridesRaw();
  if (overridesUnsaved && overridesUnsaved.raw === raw) return overridesUnsaved.value;
  overridesUnsaved = null;
  if (!overridesCache || overridesCache.raw !== raw) {
    overridesCache = { raw, value: readStored(PLAYER_OVERRIDES_STORAGE_KEY, parseOverrides, NO_OVERRIDES) };
  }
  return overridesCache.value;
}

function writeOverrides(next: readonly PlayerOverrideField[]): void {
  writeStored(PLAYER_OVERRIDES_STORAGE_KEY, next);
  const raw = readOverridesRaw();
  if (raw === JSON.stringify(next)) overridesCache = { raw, value: next };
  else overridesUnsaved = { raw, value: next };
}

/** The fields the player typed over the selected character's own (empty with no character). */
export function usePlayerOverrides(): readonly PlayerOverrideField[] {
  return useSyncExternalStore(subscribe, getOverridesSnapshot);
}

/**
 * A patch naming a character (`characterSlug`) selects it: its values replace every override.
 * Any other change to faction / class / level is the player typing over the selected character.
 */
function trackOverrides(prev: PlayerSettings, patch: Partial<PlayerSettings>): void {
  if (patch.characterSlug !== undefined) {
    if (getOverridesSnapshot().length > 0) writeOverrides(NO_OVERRIDES);
    return;
  }
  if (prev.characterSlug === null) return;
  const current = getOverridesSnapshot();
  const merged = PLAYER_OVERRIDE_FIELDS.filter(
    (field) => current.includes(field) || (patch[field] !== undefined && patch[field] !== prev[field]),
  );
  if (merged.length !== current.length) writeOverrides(merged);
}

function updatePlayerSettings(patch: Partial<PlayerSettings>): void {
  const prev = getSnapshot();
  trackOverrides(prev, patch);
  writeSettings(prev, patch);
}

/**
 * The selected character's current faction / class / level, for the fields the player hasn't typed over.
 * Ignored when `wanted` is for another character than the selected one.
 */
export function followCharacterSettings(wanted: Pick<PlayerSettings, PlayerOverrideField | "characterSlug">): void {
  const prev = getSnapshot();
  if (prev.characterSlug === null || prev.characterSlug !== wanted.characterSlug) return;
  const overridden = getOverridesSnapshot();
  const patch: Partial<PlayerSettings> = {};
  for (const field of PLAYER_OVERRIDE_FIELDS) {
    if (!overridden.includes(field) && prev[field] !== wanted[field]) Object.assign(patch, { [field]: wanted[field] });
  }
  if (Object.keys(patch).length > 0) writeSettings(prev, patch);
}

function writeSettings(prev: PlayerSettings, patch: Partial<PlayerSettings>): void {
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
