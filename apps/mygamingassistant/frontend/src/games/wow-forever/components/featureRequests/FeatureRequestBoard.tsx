import clsx from "clsx";
import { AlertBox, LoadingButton } from "@platform/ui";
import FeatureRequestEmpty from "@/games/wow-forever/components/featureRequests/FeatureRequestEmpty";
import FeatureRequestFilters from "@/games/wow-forever/components/featureRequests/FeatureRequestFilters";
import FeatureRequestList from "@/games/wow-forever/components/featureRequests/FeatureRequestList";
import FeatureRequestListSkeleton from "@/games/wow-forever/components/featureRequests/FeatureRequestListSkeleton";
import { BOARD_SECTION_ID } from "@/games/wow-forever/data/featureRequests/featureRequestBoard";
import { SUGGEST_COPY } from "@/games/wow-forever/data/featureRequests/suggestCopy";
import { isFilteredBoard } from "@/games/wow-forever/lib/featureRequests/boardParams";
import { ideasCountLabel } from "@/games/wow-forever/lib/featureRequests/featureRequestFormat";
import type { BoardFilters } from "@/games/wow-forever/types/featureRequests/boardFilters";
import type { FeatureBoardState } from "@/games/wow-forever/types/featureRequests/featureBoardState";
import type { MeTooState } from "@/games/wow-forever/types/featureRequests/meTooState";
import type { PublicStory } from "@/games/wow-forever/types/featureRequests/publicStory";

interface FeatureRequestBoardProps {
  board: FeatureBoardState;
  filters: BoardFilters;
  onFiltersChange: (patch: Partial<BoardFilters>) => void;
  onClearFilters: () => void;
  meToo: MeTooState;
  mine: ReadonlySet<string>;
  /** A `?r=` story that isn't in the loaded pages, shown above them. */
  pinned: PublicStory | null;
  onWriteIdea: () => void;
}

/**
 * "What players are asking for": the filters, the cards with "Me too", and "Show more". Loads on its own —
 * the form above works whether or not it does.
 */
export default function FeatureRequestBoard({
  board,
  filters,
  onFiltersChange,
  onClearFilters,
  meToo,
  mine,
  pinned,
  onWriteIdea,
}: FeatureRequestBoardProps) {
  const filtered = isFilteredBoard(filters);
  const isEmpty = !board.isLoading && !board.isError && board.stories.length === 0;

  return (
    <section id={BOARD_SECTION_ID} aria-labelledby="feature-request-board-h" className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="feature-request-board-h" className="text-lg font-semibold">
          {SUGGEST_COPY.boardHeading}
        </h2>
        {board.isLoading || board.isError ? null : (
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {ideasCountLabel(board.total)}
          </p>
        )}
      </div>
      {pinned !== null ? (
        <FeatureRequestList stories={[pinned]} mine={mine} highlight={pinned.id} meToo={meToo} />
      ) : null}
      {board.isLoading ? <FeatureRequestListSkeleton /> : null}
      {board.isError ? (
        <AlertBox variant="error">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p>{SUGGEST_COPY.boardError}</p>
            <button
              type="button"
              onClick={board.refetch}
              className="min-h-[44px] px-2 font-medium underline underline-offset-2"
            >
              Retry
            </button>
          </div>
        </AlertBox>
      ) : null}
      {board.isLoading || board.isError ? null : (
        <div className={clsx("space-y-4 transition-opacity", board.isStale && "opacity-60")} aria-busy={board.isStale}>
          <FeatureRequestFilters filters={filters} onChange={onFiltersChange} />
          {isEmpty ? (
            <FeatureRequestEmpty
              variant={filtered ? "filtered" : "none"}
              onClearFilters={onClearFilters}
              onWriteIdea={onWriteIdea}
            />
          ) : (
            <FeatureRequestList stories={board.stories} mine={mine} highlight={filters.highlight} meToo={meToo} />
          )}
          {board.hasNextPage ? (
            <LoadingButton
              type="button"
              variant="secondary"
              className="w-full"
              isLoading={board.isFetchingNextPage}
              loadingText="Loading more…"
              onClick={board.fetchNextPage}
            >
              Show more
            </LoadingButton>
          ) : null}
        </div>
      )}
    </section>
  );
}
