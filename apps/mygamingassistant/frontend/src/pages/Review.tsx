/**
 * Review Queue page — /review
 *
 * Lists pending_review lineups with classifier suggestions.
 * Per rules/visible-loading-feedback.md: skeleton loading states, inline
 * button loading states for all async actions.
 *
 * Components live in src/components/review/:
 *   ReviewCard         — single lineup card with screenshots + form fields
 *   ReviewScreenshot   — screenshot with lightbox + interactive aim anchor
 *   ConfidenceBadge    — color-coded confidence pill
 *   ReviewSkeletonCard — loading placeholder
 */

import { useMemo, useState } from "react";
import {
  Check,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
} from "lucide-react";
import { showError, showSuccess } from "@platform/ui";
import {
  useGetPendingLineupsQuery,
  useBulkAcceptLineupsMutation,
} from "@/store/lineupsApi";
import { useGetGamesQuery } from "@/store/gamesApi";
import ReviewCard from "@/components/review/ReviewCard";
import ReviewSkeletonCard from "@/components/review/ReviewSkeletonCard";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 10;

const CONFIDENCE_LEVELS = [
  { label: "All confidence", value: undefined },
  { label: "Low (<0.5)", value: 0.49 },
  { label: "Medium (<0.75)", value: 0.74 },
] as const;

// ---------------------------------------------------------------------------
// Review page
// ---------------------------------------------------------------------------

export default function Review() {
  const [page, setPage] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confidenceFilter, setConfidenceFilter] = useState<number | undefined>(
    undefined,
  );
  const [gameSlugFilter, setGameSlugFilter] = useState<string>("");

  const { data: games } = useGetGamesQuery();
  const { data, isLoading, isError, isFetching } = useGetPendingLineupsQuery({
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    confidence_max: confidenceFilter,
    game_slug: gameSlugFilter || undefined,
  });

  const [bulkAccept, { isLoading: isBulkAccepting }] =
    useBulkAcceptLineupsMutation();

  const lineups = useMemo(() => data?.items ?? [], [data?.items]);

  // Minimap resolution lives in ReviewCard, not here. Pending lineups carry
  // their classification in the suggested_* columns and map_id stays null
  // until accept, so a page-level lineup.map_id → minimap lookup resolved to
  // null for every card — and the maps fetch was skipped entirely whenever
  // the first card was unclassified (its game_id null). ReviewCard now
  // fetches maps for the operator-selected game and resolves the minimap
  // from the selected map reactively.
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === lineups.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(lineups.map((l) => l.id)));
    }
  };

  const handleBulkAccept = async () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    try {
      const accepted = await bulkAccept({
        lineup_ids: ids,
        patches: {},
      }).unwrap();
      showSuccess(
        `Accepted ${accepted.length} lineup${accepted.length === 1 ? "" : "s"}.`,
      );
      setSelectedIds(new Set());
    } catch {
      showError("Bulk accept failed. Some lineups may still be pending.");
    }
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    setSelectedIds(new Set());
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <main className="p-4 sm:p-8 space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <ClipboardList className="w-6 h-6 text-muted-foreground" aria-hidden />
          Review Queue
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {total > 0
            ? `${total} pending lineup${total === 1 ? "" : "s"} to review.`
            : "No pending lineups."}
        </p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 items-end">
        <label className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground font-medium">Game</span>
          <select
            value={gameSlugFilter}
            onChange={(e) => {
              setGameSlugFilter(e.target.value);
              setPage(0);
            }}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">All games</option>
            {games?.map((g) => (
              <option key={g.slug} value={g.slug}>
                {g.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground font-medium">
            Confidence
          </span>
          <select
            value={confidenceFilter ?? ""}
            onChange={(e) => {
              const val =
                e.target.value === ""
                  ? undefined
                  : parseFloat(e.target.value);
              setConfidenceFilter(val);
              setPage(0);
            }}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            {CONFIDENCE_LEVELS.map((l) => (
              <option key={l.label} value={l.value ?? ""}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Loading state — skeletons */}
      {isLoading && (
        <div className="space-y-4" aria-label="Loading pending lineups">
          {Array.from({ length: 3 }).map((_, i) => (
            <ReviewSkeletonCard key={i} />
          ))}
        </div>
      )}

      {/* Error state */}
      {isError && (
        <p className="text-sm text-destructive">
          Failed to load pending lineups. Please refresh.
        </p>
      )}

      {/* Empty state */}
      {!isLoading && !isError && lineups.length === 0 && (
        <div className="rounded-lg border-2 border-dashed p-12 text-center">
          <ClipboardList
            className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3"
            aria-hidden
          />
          <p className="text-sm text-muted-foreground font-medium">
            No pending lineups
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Add a source at{" "}
            <a href="/sources" className="underline hover:text-foreground">
              /sources
            </a>{" "}
            or upload manually at{" "}
            <a href="/lineups/new" className="underline hover:text-foreground">
              /lineups/new
            </a>
            .
          </p>
        </div>
      )}

      {/* Select-all header */}
      {!isLoading && lineups.length > 0 && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggleSelectAll}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <CheckSquare className="w-4 h-4" />
            {selectedIds.size === lineups.length
              ? "Deselect all"
              : `Select all (${lineups.length})`}
          </button>
          {isFetching && !isLoading && (
            <span className="text-xs text-muted-foreground animate-pulse">
              Refreshing…
            </span>
          )}
        </div>
      )}

      {/* Lineup cards */}
      {!isLoading && !isError && lineups.length > 0 && (
        <div className="space-y-4">
          {lineups.map((lineup) => (
            <ReviewCard
              key={lineup.id}
              lineup={lineup}
              checked={selectedIds.has(lineup.id)}
              onCheckToggle={() => toggleSelect(lineup.id)}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center gap-3 justify-center pt-2">
          <button
            type="button"
            onClick={() => handlePageChange(page - 1)}
            disabled={page === 0}
            className="inline-flex items-center gap-1 rounded-md border px-3 h-8 text-xs disabled:opacity-40"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Prev
          </button>
          <span className="text-xs text-muted-foreground">
            Page {page + 1} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => handlePageChange(page + 1)}
            disabled={page >= totalPages - 1}
            className="inline-flex items-center gap-1 rounded-md border px-3 h-8 text-xs disabled:opacity-40"
          >
            Next
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Bulk accept sticky bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-center gap-4 p-4 bg-background/95 backdrop-blur border-t shadow-lg">
          <span className="text-sm text-muted-foreground">
            {selectedIds.size} lineup{selectedIds.size === 1 ? "" : "s"} selected
          </span>
          <button
            type="button"
            onClick={handleBulkAccept}
            disabled={isBulkAccepting}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 h-9 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            <Check
              className={`w-4 h-4 ${isBulkAccepting ? "animate-pulse" : ""}`}
            />
            {isBulkAccepting
              ? "Accepting…"
              : `Accept ${selectedIds.size} selected`}
          </button>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        </div>
      )}
    </main>
  );
}
