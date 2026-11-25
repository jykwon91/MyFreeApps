import { useCallback, useMemo } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { findClass, findSpec, firstSpec } from "@/games/wow-forever/data/classes";
import { GEAR_VIEW, isGearView } from "@/games/wow-forever/data/gear/gearViews";
import { MAX_LEVEL, playerLevel } from "@/games/wow-forever/data/levelCap";
import {
  PLAYER_SETTINGS_STORAGE_KEY,
  parsePlayerSettings,
  usePlayerSettings,
  type PlayerSettings,
} from "@/games/wow-forever/hooks/usePlayerSettings";
import { useSelectedCharacter } from "@/games/wow-forever/hooks/useSelectedCharacter";
import { readStored, writeStored } from "@/games/wow-forever/lib/safeLocalStorage";
import type { CharacterDefaultState } from "@/games/wow-forever/types/character/characterDefaultState";
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

/** With a character selected, its class, level and faction replace the remembered ones (the spec stays when the class does). */
function followingCharacter(settings: GearSettings, player: PlayerSettings): GearSettings {
  if (player.characterSlug === null) return settings;
  return {
    ...settings,
    classId: player.classId,
    specId: settings.classId === player.classId ? settings.specId : firstSpec(player.classId),
    level: player.level,
    faction: player.faction,
  };
}

/** Last settings used here; else class, level and faction from the World Map "You" section. The selected character wins for those three. */
function storedSettings(player: PlayerSettings): GearSettings {
  const stored = readStored<GearSettings | null>(
    GEAR_SETTINGS_STORAGE_KEY,
    (raw) => (typeof raw === "object" && raw !== null ? parseGearSettings(raw as Record<string, unknown>, DEFAULT_GEAR_SETTINGS) : null),
    null,
  );
  if (stored) return followingCharacter(stored, player);
  const saved = readStored(PLAYER_SETTINGS_STORAGE_KEY, parsePlayerSettings, null);
  if (!saved) return DEFAULT_GEAR_SETTINGS;
  return {
    ...DEFAULT_GEAR_SETTINGS,
    classId: saved.classId,
    specId: firstSpec(saved.classId),
    level: saved.level,
    faction: saved.faction,
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

/** The URL carries the view, and class / level / faction (the character's own when `base` is given) only where they differ from `base`. */
function toParams(s: GearSettings, base: GearSettings | null): Record<string, string> {
  const same = (field: "classId" | "specId" | "level" | "faction") => base !== null && s[field] === base[field];
  const out: Record<string, string> = { [GEAR_URL_PARAMS.view]: s.view };
  if (!same("classId") || !same("specId")) {
    out[GEAR_URL_PARAMS.classId] = s.classId;
    out[GEAR_URL_PARAMS.specId] = s.specId;
  }
  if (!same("faction")) out[GEAR_URL_PARAMS.faction] = s.faction;
  if (!same("level")) {
    // A level cleared over the character's own is sent empty: "none", not "the character's".
    if (s.level !== null) out[GEAR_URL_PARAMS.level] = String(s.level);
    else if (base !== null) out[GEAR_URL_PARAMS.level] = "";
  }
  if (s.includePvp) out[GEAR_URL_PARAMS.includePvp] = "1";
  return out;
}

/**
 * Best gear settings. The URL holds them (a link shares the exact question)
 * and they're remembered for the next visit. Switching table (`view`) adds a
 * history entry so Back returns to the other table; everything else replaces.
 * Choosing a view leaves a share link's fragment; any other change keeps it.
 */
export function useGearSettings(): [GearSettings, (patch: Partial<GearSettings>) => void, CharacterDefaultState | null] {
  const [params] = useSearchParams();
  const { pathname, hash } = useLocation();
  const navigate = useNavigate();
  const [player] = usePlayerSettings();
  const { name } = useSelectedCharacter();
  const following = player.characterSlug !== null;
  const base = useMemo(() => storedSettings(player), [player]);
  const settings = useMemo(() => parseGearSettings(fromParams(params), base), [params, base]);
  const overridden = following && (settings.classId !== base.classId || settings.level !== base.level || settings.faction !== base.faction);

  const go = useCallback(
    (next: GearSettings, push: boolean, keepHash: boolean) => {
      writeStored(GEAR_SETTINGS_STORAGE_KEY, next);
      const search = `?${new URLSearchParams(toParams(next, following ? base : null)).toString()}`;
      navigate({ pathname, search, hash: keepHash ? hash : "" }, { replace: !push });
    },
    [base, following, navigate, pathname, hash],
  );

  const update = useCallback(
    (patch: Partial<GearSettings>) => {
      const next = { ...settings, ...patch };
      // Spec ids are only unique within a class.
      if (patch.classId && patch.classId !== settings.classId && patch.specId === undefined) {
        next.specId = firstSpec(patch.classId);
      }
      go(next, patch.view !== undefined && patch.view !== settings.view, patch.view === undefined);
    },
    [settings, go],
  );

  const reset = useCallback(
    () => go({ ...settings, classId: base.classId, specId: base.specId, level: base.level, faction: base.faction }, false, true),
    [settings, base, go],
  );

  return [settings, update, name ? { characterName: name, overridden, reset } : null];
}
