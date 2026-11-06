import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { parseBoardFilters, withBoardFilters } from "@/games/wow-forever/lib/featureRequests/boardParams";
import type { BoardFilters } from "@/games/wow-forever/types/featureRequests/boardFilters";
import type { UpdateBoardFilters } from "@/games/wow-forever/types/featureRequests/updateBoardFilters";

/**
 * The board's filters, kept in the URL. Changing a filter replaces the history entry (Back leaves the
 * page instead of undoing chips); a highlight (`?r=`, "View on board") pushes one, so Back returns —
 * unless `replace` is asked for (following a merged story's link must not leave a Back trap).
 */
export function useBoardFilters(): [BoardFilters, UpdateBoardFilters] {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => parseBoardFilters(params), [params]);
  const update = useCallback<UpdateBoardFilters>(
    (patch, options) => {
      const push = patch.highlight !== undefined && patch.highlight !== null && options?.replace !== true;
      setParams((prev) => withBoardFilters(prev, push ? patch : { highlight: null, ...patch }), { replace: !push });
    },
    [setParams],
  );
  return [filters, update];
}
