/**
 * Loads the crafting profession files needed for the guild "Help each other" tab.
 *
 * Returns:
 * - `files`: the loaded map when ready, null while loading.
 * - `error`: true when at least one file failed to load.
 * - `retry`: clears the error and re-attempts loading.
 */
import { useCallback, useEffect, useState } from "react";
import { loadCraftingData } from "@/games/wow-forever/crafting/loadCraftingData";
import { ALL_HELP_CRAFTING_PROFESSIONS } from "@/games/wow-forever/data/guild/guildHelpCrafting";
import { PROFESSION_SKILL_LINES } from "@/games/wow-forever/data/professions/professionSkillLines";
import type { CraftingFile } from "@/games/wow-forever/types/crafting";

export type CraftingFileMap = ReadonlyMap<number, Pick<CraftingFile, "recipes">>;

export interface HelpCraftingFilesState {
  /** The loaded files; null while loading or after an error. */
  files: CraftingFileMap | null;
  /** True when loading failed. */
  error: boolean;
  /** Clears the error and re-attempts loading. */
  retry: () => void;
}

export function useHelpCraftingFiles(enabled: boolean): HelpCraftingFilesState {
  const [files, setFiles] = useState<CraftingFileMap | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled || files !== null) return;
    let live = true;
    Promise.all(
      ALL_HELP_CRAFTING_PROFESSIONS.map(async (prof) => {
        const data = await loadCraftingData(prof);
        const id = PROFESSION_SKILL_LINES[prof as keyof typeof PROFESSION_SKILL_LINES];
        return [id, data.file] as const;
      }),
    ).then(
      (entries) => {
        if (!live) return;
        setFiles(new Map(entries));
      },
      () => {
        if (!live) return;
        setError(true);
      },
    );
    return () => {
      live = false;
    };
  // `attempt` triggers a retry when the caller calls `retry()`.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, attempt]);

  const retry = useCallback(() => {
    setError(false);
    setFiles(null);
    setAttempt((n) => n + 1);
  }, []);

  return { files, error, retry };
}
