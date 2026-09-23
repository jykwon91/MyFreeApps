import { useCallback, useState } from "react";
import { findClass, type WowClassId } from "@/games/wow-forever/data/classes";
import { readStored, writeStored } from "@/games/wow-forever/lib/safeLocalStorage";
import { FACTION, type PlayerFaction } from "@/games/wow-forever/types/worldMap";

export const PLAYER_SETTINGS_STORAGE_KEY = "mga.wowForever.worldMap.player.v1";

export const MAX_LEVEL = 60;

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
  if (typeof r.level === "number" && Number.isInteger(r.level) && r.level >= 1 && r.level <= MAX_LEVEL) level = r.level;
  let position: PlayerSettings["position"] = null;
  const p = r.position as Record<string, unknown> | null | undefined;
  if (zoneId !== null && p && isPercent(p.x) && isPercent(p.y)) position = { x: p.x, y: p.y };
  return { faction, classId: cls.id, zoneId, level, position };
}

export function usePlayerSettings(): [PlayerSettings, (patch: Partial<PlayerSettings>) => void] {
  const [settings, setSettings] = useState<PlayerSettings>(() =>
    readStored(PLAYER_SETTINGS_STORAGE_KEY, parsePlayerSettings, DEFAULT_PLAYER_SETTINGS),
  );

  const update = useCallback((patch: Partial<PlayerSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      // A new zone means the old position (map percent on the old zone) is meaningless.
      if (patch.zoneId !== undefined && patch.zoneId !== prev.zoneId && patch.position === undefined) {
        next.position = null;
      }
      writeStored(PLAYER_SETTINGS_STORAGE_KEY, next);
      return next;
    });
  }, []);

  return [settings, update];
}
