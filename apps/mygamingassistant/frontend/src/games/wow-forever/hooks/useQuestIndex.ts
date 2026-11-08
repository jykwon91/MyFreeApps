import { useEffect, useState } from "react";
import { QUESTS_STATUS } from "@/games/wow-forever/data/quests/questsConfig";
import { loadQuestIndex } from "@/games/wow-forever/lib/quests/loadQuestIndex";
import type { QuestIndex } from "@/games/wow-forever/types/quests/questIndex";

type QuestIndexState =
  | { status: typeof QUESTS_STATUS.loading }
  | { status: typeof QUESTS_STATUS.ready; data: QuestIndex }
  | { status: typeof QUESTS_STATUS.error; retry: () => void };

const reloadPage = () => window.location.reload();

/** The quest index, loaded once (its own chunk). */
export function useQuestIndex(): QuestIndexState {
  const [data, setData] = useState<QuestIndex | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    loadQuestIndex().then(
      (loaded) => live && setData(loaded),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, []);

  if (data) return { status: QUESTS_STATUS.ready, data };
  if (failed) return { status: QUESTS_STATUS.error, retry: reloadPage };
  return { status: QUESTS_STATUS.loading };
}
