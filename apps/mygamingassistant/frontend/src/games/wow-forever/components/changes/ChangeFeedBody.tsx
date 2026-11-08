import { useMemo } from "react";
import LoadErrorRetry from "@/components/game/LoadErrorRetry";
import ChangeFeedList from "@/games/wow-forever/components/changes/ChangeFeedList";
import ChangeFeedSkeleton from "@/games/wow-forever/components/changes/ChangeFeedSkeleton";
import { CHANGE_CATEGORY_LABEL } from "@/games/wow-forever/data/changes/changeCategories";
import { CHANGE_INDEX } from "@/games/wow-forever/data/changes/changeFiles";
import { useChangeFeed } from "@/games/wow-forever/hooks/useChangeFeed";
import { filterChanges } from "@/games/wow-forever/lib/changes/filterChanges";
import type { ChangeFilters } from "@/games/wow-forever/types/changes/changeFilters";

/** Skeleton while the category loads, a retry if it failed, the filtered rows once it's in. */
export default function ChangeFeedBody({ filters }: { filters: ChangeFilters }) {
  const state = useChangeFeed(filters.category);
  const entries = useMemo(
    () => (state.status === "ready" ? filterChanges(state.entries, filters, CHANGE_INDEX.build) : []),
    [state, filters],
  );
  if (state.status === "error") {
    const label = CHANGE_CATEGORY_LABEL[filters.category].toLowerCase();
    return <LoadErrorRetry message={`Couldn't load the ${label} changes.`} onRetry={state.retry} retrying={state.retrying} />;
  }
  if (state.status === "loading") return <ChangeFeedSkeleton />;
  const listKey = `${filters.category}|${filters.classId ?? ""}|${filters.query}|${filters.sinceLastBuild}`;
  return <ChangeFeedList key={listKey} entries={entries} />;
}
