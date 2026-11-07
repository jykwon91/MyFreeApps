import { useCallback, useMemo } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { findClass, findSpec, firstSpec } from "@/games/wow-forever/data/classes";
import { GEAR_VIEW, isGearView } from "@/games/wow-forever/data/gear/gearViews";
import { MAX_LEVEL, playerLevel } from "@/games/wow-forever/data/levelCap";
import { PLAYER_SETTINGS_STORAGE_KEY, parsePlayerSettings } from "@/games/wow-forever/hooks/usePlayerSettings";
import { readStored, writeStored } from "@/games/wow-forever/lib/safeLocalStorage";
import type { GearSettings } from "@/games/wow-forever/types/gearSettings";
import { FACTION, type PlayerFaction } from "@/games/wow-forever/types/worldMap";

export const GEAR_SETTINGS_STORAGE_KEY = "mga.wowForever.gear.settings.v1";

/** URL query keys for each setting. */
export const GEAR_URL_PARAMS = { classId: "class", specId: "spec", level: "lvl", faction: "faction", view: "view", includePvp: "pvp" } as const;

export const DEFAULT_GEAR_SETTINGS: GearSettings = {
  classId: "warlock",
  specId: firstSpec("warlock"),
  level: null,
  faction: FACTION.alliance,
  view: GEAR_VIEW.leveling,
  includePvp: false,
};

function levelFrom(raw: unknown): number | null {
  const n = typeof raw === "string" ? Number(raw) : raw;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > MAX_LEVEL) return null;
  return playerLevel(n);
}

function factionFrom(raw: unknown, fallback: PlayerFaction): PlayerFaction {
  if (raw === FACTION.alliance || raw === FACTION.horde) return raw;
  return fallback;
}

function boolFrom(raw: unknown, fallback: boolean): boolean {
  if (raw === true || raw === "1") return true;
  if (raw === false || raw === "0") return false;
  return fallback;
}

/** Accept a stored or URL value field by field, falling back per field. A spec that isn't the class's becomes its first. */
export function parseGearSettings(raw: Record<string, unknown>, fallback: GearSettings): GearSettings {
  const cls = typeof raw.classId === "string" ? findClass(raw.classId) : undefined;
  const classId = cls?.id ?? fallback.classId;
  const specSource = cls ? raw.specId : (raw.specId ?? fallback.specId);
  const specId = typeof specSource === "string" && findSpec(classId, specSource) ? specSource : firstSpec(classId);
  return {
    classId,
    specId,
    level: raw.level === undefined ? fallback.level : levelFrom(raw.level),
    faction: factionFrom(raw.faction, fallback.faction),
    view: typeof raw.view === "string" && isGearView(raw.view) ? raw.view : fallback.view,
    includePvp: boolFrom(raw.includePvp, fallback.includePvp),
  };
}

/** Last settings used here; else class, level and faction from the World Map "You" section. */
function storedSettings(): GearSettings {
  const stored = readStored<GearSettings | null>(
    GEAR_SETTINGS_STORAGE_KEY,
    (raw) => (typeof raw === "object" && raw !== null ? parseGearSettings(raw as Record<string, unknown>, DEFAULT_GEAR_SETTINGS) : null),
    null,
  );
  if (stored) return stored;
  const player = readStored(PLAYER_SETTINGS_STORAGE_KEY, parsePlayerSettings, null);
  if (!player) return DEFAULT_GEAR_SETTINGS;
  return {
    ...DEFAULT_GEAR_SETTINGS,
    classId: player.classId,
    specId: firstSpec(player.classId),
    level: player.level,
    faction: player.faction,
  };
}

function fromParams(params: URLSearchParams): Record<string, unknown> {
  const raw: Record<string, unknown> = {};
  for (const [field, key] of Object.entries(GEAR_URL_PARAMS)) {
    const value = params.get(key);
    if (value !== null) raw[field] = value;
  }
  return raw;
}

function toParams(s: GearSettings): Record<string, string> {
  const out: Record<string, string> = {
    [GEAR_URL_PARAMS.classId]: s.classId,
    [GEAR_URL_PARAMS.specId]: s.specId,
    [GEAR_URL_PARAMS.faction]: s.faction,
    [GEAR_URL_PARAMS.view]: s.view,
  };
  if (s.level !== null) out[GEAR_URL_PARAMS.level] = String(s.level);
  if (s.includePvp) out[GEAR_URL_PARAMS.includePvp] = "1";
  return out;
}

/**
 * Best gear settings. The URL holds them (a link shares the exact question)
 * and they're remembered for the next visit. Switching table (`view`) adds a
 * history entry so Back returns to the other table; everything else replaces.
 * Choosing a view leaves a share link's fragment; any other change keeps it.
 */
export function useGearSettings(): [GearSettings, (patch: Partial<GearSettings>) => void] {
  const [params] = useSearchParams();
  const { pathname, hash } = useLocation();
  const navigate = useNavigate();
  const settings = useMemo(() => parseGearSettings(fromParams(params), storedSettings()), [params]);

  const update = useCallback(
    (patch: Partial<GearSettings>) => {
      const next = { ...settings, ...patch };
      // Spec ids are only unique within a class.
      if (patch.classId && patch.classId !== settings.classId && patch.specId === undefined) {
        next.specId = firstSpec(patch.classId);
      }
      writeStored(GEAR_SETTINGS_STORAGE_KEY, next);
      const push = patch.view !== undefined && patch.view !== settings.view;
      const search = `?${new URLSearchParams(toParams(next)).toString()}`;
      navigate({ pathname, search, hash: patch.view === undefined ? hash : "" }, { replace: !push });
    },
    [settings, navigate, pathname, hash],
  );

  return [settings, update];
}
