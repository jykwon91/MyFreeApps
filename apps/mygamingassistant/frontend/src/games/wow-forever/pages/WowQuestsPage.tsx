import LoadErrorRetry from "@/components/game/LoadErrorRetry";
import QuestList from "@/games/wow-forever/components/quests/QuestList";
import QuestListSkeleton from "@/games/wow-forever/components/quests/QuestListSkeleton";
import WowPageHeader from "@/games/wow-forever/components/shared/WowPageHeader";
import { QUESTS_STATUS } from "@/games/wow-forever/data/quests/questsConfig";
import { useDocumentTitle } from "@/games/wow-forever/hooks/useDocumentTitle";
import { useQuestIndex } from "@/games/wow-forever/hooks/useQuestIndex";
import { useQuestSeen } from "@/games/wow-forever/hooks/useQuestSeen";

/** /wow-forever/quests — searchable, filterable list of all quests the Forever client knows. */
export default function WowQuestsPage() {
  useDocumentTitle("Quests · WoW Forever");
  const state = useQuestIndex();
  const { seenIds } = useQuestSeen();
  return (
    <main className="p-4 sm:p-8 space-y-4 max-w-4xl">
      <WowPageHeader
        title="Quests"
        subtitle="Every quest the WoW Forever client has. Search by name, filter by zone, faction or level, or look up a specific quest's details."
        backTo="/wow-forever"
        backLabel="Back to WoW Forever"
      />
      {state.status === QUESTS_STATUS.error ? (
        <LoadErrorRetry message="Couldn't load the quest list." onRetry={state.retry} retrying={false} />
      ) : null}
      {state.status === QUESTS_STATUS.ready ? (
        <QuestList index={state.data} seenIds={seenIds} />
      ) : null}
      {state.status === QUESTS_STATUS.loading ? <QuestListSkeleton /> : null}
    </main>
  );
}
