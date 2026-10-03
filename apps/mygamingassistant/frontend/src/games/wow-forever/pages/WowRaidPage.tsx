import { useParams } from "react-router-dom";
import { useGetRaidPageQuery } from "@/games/wow-forever/api/wowRaidsApi";
import RaidLoadError from "@/games/wow-forever/components/raid/RaidLoadError";
import RaidNotFound from "@/games/wow-forever/components/raid/RaidNotFound";
import RaidPageContent from "@/games/wow-forever/components/raid/RaidPageContent";
import RaidPageSkeleton from "@/games/wow-forever/components/raid/RaidPageSkeleton";
import { RAID_CLOCK_TICK_MS, RAID_POLLING, RAID_PROBLEM } from "@/games/wow-forever/data/raidPage";
import { useNow } from "@/games/wow-forever/hooks/useNow";
import { raidPageProblem } from "@/games/wow-forever/lib/raidPageError";

/**
 * A posted raid's public page — `/wow-forever/raids/:webId`, linked from [Web view] on its Discord post.
 *
 * Read-only, for anyone with the link (its id is unguessable). Not gated by `isReadOnly()`: it is the same page on
 * the serve-only site and inside the Discord Activity.
 */
export default function WowRaidPage() {
  const { webId = "" } = useParams();
  const query = useGetRaidPageQuery(webId, RAID_POLLING);
  const now = useNow(RAID_CLOCK_TICK_MS);
  const problem = raidPageProblem(query.error);
  const refresh = () => {
    void query.refetch();
  };

  // Not found wins over what's on screen: the raid was deleted since the last read.
  if (problem !== null && problem.kind === RAID_PROBLEM.NOT_FOUND) return <RaidNotFound />;
  if (query.currentData !== undefined) {
    return (
      <RaidPageContent
        page={query.currentData}
        now={now}
        fetchedAt={query.fulfilledTimeStamp}
        isFetching={query.isFetching}
        refreshProblem={problem}
        onRefresh={refresh}
      />
    );
  }
  if (problem !== null) {
    return <RaidLoadError message={problem.message} isRetrying={query.isFetching} onRetry={refresh} />;
  }
  return <RaidPageSkeleton />;
}
