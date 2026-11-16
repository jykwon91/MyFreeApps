import { useCallback, useEffect, useState } from "react";
import { loadQuestDetail } from "@/games/wow-forever/lib/quests/loadQuestDetail";
import type { QuestDetailLoad } from "@/games/wow-forever/types/quests/questDetailLoad";
import type { QuestPageResult } from "@/games/wow-forever/types/quests/questPageResult";

interface ReadyState {
  status: "ready";
  quest: QuestPageResult;
  dungeonSlug: string | null;
}

interface NotFoundState {
  status: "not-found";
}

interface ErrorState {
  status: "error";
  retry: () => void;
  retrying: boolean;
}

export type QuestDetailState =
  | { status: "loading" }
  | ReadyState
  | NotFoundState
  | ErrorState;

interface Loaded {
  questId: number;
  attempt: number;
  data: QuestDetailLoad | null;
}

/** Loads the quest detail for a given quest id. */
export function useQuestDetail(questId: number | null): QuestDetailState {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (questId === null) return;
    let live = true;
    loadQuestDetail(questId).then(
      (data) => live && setLoaded({ questId, attempt, data }),
      () => live && setLoaded({ questId, attempt, data: null }),
    );
    return () => {
      live = false;
    };
  }, [questId, attempt]);

  // No valid id in the URL → not found, not an error.
  if (questId === null) return { status: "not-found" };
  if (loaded === null || loaded.questId !== questId) return { status: "loading" };
  if (loaded.data === null) return { status: "error", retry, retrying: loaded.attempt !== attempt };
  if (loaded.data.quest === null) return { status: "not-found" };
  return { status: "ready", quest: loaded.data.quest, dungeonSlug: loaded.data.dungeonSlug };
}
