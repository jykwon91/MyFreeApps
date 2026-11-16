import { useMemo } from "react";
import { skipToken } from "@reduxjs/toolkit/query/react";
import { useGetCompletedQuestsQuery } from "@/games/wow-forever/api/wowCharacterApi";
import { usePlayerSettings } from "@/games/wow-forever/hooks/usePlayerSettings";
import { characterNameFromSlug } from "@/games/wow-forever/lib/character/characterSlug";
import { isNotFoundError } from "@/games/wow-forever/lib/isNotFoundError";
import type { BattleNetQuestsState } from "@/games/wow-forever/types/dungeons/battleNetQuestsState";

/** The quests the character "Use for MGA's pages" saved has completed, from Battle.net. Cached data stays while it refetches. */
export function useBattleNetQuests(): BattleNetQuestsState {
  const [{ characterSlug }] = usePlayerSettings();
  const { data, error, isFetching, refetch } = useGetCompletedQuestsQuery(characterSlug ?? skipToken);
  return useMemo((): BattleNetQuestsState => {
    if (!characterSlug) return { kind: "none" };
    const characterName = characterNameFromSlug(characterSlug);
    if (data) return { kind: "ready", characterName, ids: new Set(data.quest_ids) };
    if (error) {
      if (isNotFoundError(error)) return { kind: "not-found", characterName };
      return { kind: "error", retry: () => void refetch(), retrying: isFetching };
    }
    return { kind: "loading" };
  }, [characterSlug, data, error, isFetching, refetch]);
}
