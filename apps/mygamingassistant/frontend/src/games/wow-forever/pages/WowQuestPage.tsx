import { useParams } from "react-router-dom";
import LoadErrorRetry from "@/components/game/LoadErrorRetry";
import QuestDetailSkeleton from "@/games/wow-forever/components/quests/QuestDetailSkeleton";
import QuestDetailView from "@/games/wow-forever/components/quests/QuestDetailView";
import WowPageHeader from "@/games/wow-forever/components/shared/WowPageHeader";
import { useDocumentTitle } from "@/games/wow-forever/hooks/useDocumentTitle";
import { useQuestDetail } from "@/games/wow-forever/hooks/useQuestDetail";

const QUESTS_PATH = "/wow-forever/quests";
const BACK_LABEL = "Back to Quests";

function parseQuestId(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** /wow-forever/quests/:id — a single quest's full details. */
export default function WowQuestPage() {
  const { id } = useParams();
  const questId = parseQuestId(id);
  const state = useQuestDetail(questId);
  const title = state.status === "ready" ? state.quest.title : null;
  useDocumentTitle(title ? `${title} · WoW Forever` : "Quest · WoW Forever");

  return (
    <div className="p-4 sm:p-8 space-y-4 max-w-4xl">
      {state.status === "loading" ? (
        <>
          <WowPageHeader title="Quest" subtitle="" backTo={QUESTS_PATH} backLabel={BACK_LABEL} />
          <QuestDetailSkeleton />
        </>
      ) : null}
      {state.status === "error" ? (
        <>
          <WowPageHeader title="Quest" subtitle="" backTo={QUESTS_PATH} backLabel={BACK_LABEL} />
          <LoadErrorRetry message="Couldn't load this quest." onRetry={state.retry} retrying={state.retrying} />
        </>
      ) : null}
      {state.status === "not-found" ? (
        <>
          <WowPageHeader title="Quest not found" subtitle="" backTo={QUESTS_PATH} backLabel={BACK_LABEL} />
          <p className="text-sm text-muted-foreground">
            This quest isn't in our data yet. It may be a new Forever quest we haven't indexed.
          </p>
        </>
      ) : null}
      {state.status === "ready" ? (
        <>
          <WowPageHeader
            title={state.quest.title}
            subtitle={`Quest #${state.quest.id}`}
            backTo={QUESTS_PATH}
            backLabel={BACK_LABEL}
          />
          <QuestDetailView quest={state.quest} dungeonSlug={state.dungeonSlug} />
        </>
      ) : null}
    </div>
  );
}
