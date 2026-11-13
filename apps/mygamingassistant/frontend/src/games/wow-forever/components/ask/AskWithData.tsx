import LoadErrorRetry from "@/components/game/LoadErrorRetry";
import AskChat from "@/games/wow-forever/components/ask/AskChat";
import AskPageSkeleton from "@/games/wow-forever/components/ask/AskPageSkeleton";
import { ASK_COPY } from "@/games/wow-forever/data/ask/askCopy";
import { useAskToolData } from "@/games/wow-forever/hooks/ask/useAskToolData";
import { LOAD_STATUS } from "@/games/wow-forever/data/loadStatus";

interface AskWithDataProps {
  initialQuestion: string | null;
}

/** Loads the World Map the tools need (skeleton, then the chat — or a retry if it fails). */
export default function AskWithData({ initialQuestion }: AskWithDataProps) {
  const tools = useAskToolData();
  if (tools.status === LOAD_STATUS.error) {
    return <LoadErrorRetry message={ASK_COPY.loadError} onRetry={tools.retry} retrying={false} />;
  }
  if (tools.data === null) return <AskPageSkeleton />;
  return <AskChat tools={tools} initialQuestion={initialQuestion} />;
}
