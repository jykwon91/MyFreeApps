import { useCallback, useMemo } from "react";
import { DOWNRANK_LEVEL_PARAM, DOWNRANK_SPELL_PARAM } from "@/games/wow-forever/data/downrank/downrankConfig";
import { parsePlayerSettings, PLAYER_SETTINGS_STORAGE_KEY, usePlayerSettings } from "@/games/wow-forever/hooks/usePlayerSettings";
import { useSelectedCharacter } from "@/games/wow-forever/hooks/useSelectedCharacter";
import { parseDownrankSettings, writeDownrankSettings, type DownrankFallback } from "@/games/wow-forever/lib/downrank/downrankParams";
import { readStored } from "@/games/wow-forever/lib/safeLocalStorage";
import type { CharacterDefaultState } from "@/games/wow-forever/types/character/characterDefaultState";
import type { DownrankFamily } from "@/games/wow-forever/types/downrank/downrankFamily";
import type { DownrankSettings } from "@/games/wow-forever/types/downrank/downrankSettings";
import { useLiveSearchParams } from "@platform/ui";

function readFallback(): DownrankFallback {
  const player = readStored(PLAYER_SETTINGS_STORAGE_KEY, parsePlayerSettings, null);
  return { classId: player?.classId ?? null, level: player?.level ?? null };
}

/**
 * The calculator's settings, kept in the URL (every change replaces history). With nothing in the URL
 * the World Map's saved class and level fill in, and follow the selected character; the calculator never writes them back.
 */
export function useDownrankSettings(
  families: readonly DownrankFamily[],
): [DownrankSettings, (patch: Partial<DownrankSettings>) => void, CharacterDefaultState | null] {
  const [params, setParams] = useLiveSearchParams();
  const [player] = usePlayerSettings();
  const { name } = useSelectedCharacter();
  // Re-read whenever the saved player changes (a different character, a level-up), not once at mount.
  const fallback = useMemo(readFallback, [player]);
  const settings = useMemo(() => parseDownrankSettings(params, families, fallback), [params, families, fallback]);
  const base = useMemo(() => parseDownrankSettings(new URLSearchParams(), families, fallback), [families, fallback]);
  const classOf = (familyId: string) => families.find((f) => f.id === familyId)?.classId;
  const overridden = player.characterSlug !== null && (settings.level !== base.level || classOf(settings.familyId) !== classOf(base.familyId));

  const update = useCallback(
    (patch: Partial<DownrankSettings>) =>
      setParams((prev) => writeDownrankSettings(prev, { ...parseDownrankSettings(prev, families, fallback), ...patch }), {
        replace: true,
      }),
    [setParams, families, fallback],
  );

  const reset = useCallback(
    () =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete(DOWNRANK_SPELL_PARAM);
          next.delete(DOWNRANK_LEVEL_PARAM);
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  return [settings, update, name ? { characterName: name, overridden, reset } : null];
}
