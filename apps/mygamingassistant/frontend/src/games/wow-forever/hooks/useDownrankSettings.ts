import { useCallback, useMemo, useState } from "react";
import { parsePlayerSettings, PLAYER_SETTINGS_STORAGE_KEY } from "@/games/wow-forever/hooks/usePlayerSettings";
import { parseDownrankSettings, writeDownrankSettings, type DownrankFallback } from "@/games/wow-forever/lib/downrank/downrankParams";
import { readStored } from "@/games/wow-forever/lib/safeLocalStorage";
import type { DownrankFamily } from "@/games/wow-forever/types/downrank/downrankFamily";
import type { DownrankSettings } from "@/games/wow-forever/types/downrank/downrankSettings";
import { useLiveSearchParams } from "@platform/ui";

function readFallback(): DownrankFallback {
  const player = readStored(PLAYER_SETTINGS_STORAGE_KEY, parsePlayerSettings, null);
  return { classId: player?.classId ?? null, level: player?.level ?? null };
}

/**
 * The calculator's settings, kept in the URL (every change replaces history). With nothing in the URL
 * the World Map's saved class and level fill in; the calculator never writes them back.
 */
export function useDownrankSettings(
  families: readonly DownrankFamily[],
): [DownrankSettings, (patch: Partial<DownrankSettings>) => void] {
  const [params, setParams] = useLiveSearchParams();
  const [fallback] = useState(readFallback);
  const settings = useMemo(() => parseDownrankSettings(params, families, fallback), [params, families, fallback]);
  const update = useCallback(
    (patch: Partial<DownrankSettings>) =>
      setParams((prev) => writeDownrankSettings(prev, { ...parseDownrankSettings(prev, families, fallback), ...patch }), {
        replace: true,
      }),
    [setParams, families, fallback],
  );
  return [settings, update];
}
