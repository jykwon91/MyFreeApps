/**
 * Review Queue page — /review
 *
 * Lists pending_review lineups with classifier suggestions.
 * Each card shows:
 *   - Stand + aim screenshots (side-by-side, clickable to enlarge)
 *   - Source attribution (channel → video)
 *   - Editable classification fields populated from suggestions
 *   - Confidence indicator (border color: high=green, medium=yellow, low=red, none=grey)
 *   - Aim anchor: circle on aim screenshot; click/drag to override
 *   - Accept / Re-classify / Hide buttons
 *
 * Bulk-accept: each card has a checkbox; sticky bottom bar shows N selected + bulk accept.
 *
 * Filter bar: game chip (future), confidence threshold, source.
 * Pagination: load more / page controls at bottom.
 *
 * Per rules/visible-loading-feedback.md: all async actions show inline button loading state.
 */

import { useCallback, useRef, useState } from "react";
import {
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  RefreshCw,
  EyeOff,
  Check,
  Maximize2,
} from "lucide-react";
import { showError, showSuccess } from "@platform/ui";
import {
  useGetPendingLineupsQuery,
  useAcceptLineupMutation,
  useHideLineupMutation,
  useReclassifyLineupMutation,
  useBulkAcceptLineupsMutation,
} from "@/store/lineupsApi";
import { useGetGamesQuery } from "@/store/gamesApi";
import type { Lineup, LineupAcceptBody } from "@/types/game";

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
// Confidence badge — border color hint
// ---------------------------------------------------------------------------

function confidenceBorderClass(conf: number | null): string {
  if (conf === null) return "border-border";
  if (conf >= 0.75) return "border-green-500/60";
  if (conf >= 0.5) return "border-yellow-500/60";
  return "border-red-500/60";
}

function ConfidenceBadge({ confidence }: { confidence: number | null }) {
  if (confidence === null) {
    return (
      <span className="text-xs rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
        Unclassified
      </span>
    );
  }
  const pct = Math.round(confidence * 100);
  const colorClass =
    confidence >= 0.75
      ? "bg-green-500/15 text-green-700 dark:text-green-400"
      : confidence >= 0.5
        ? "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400"
        : "bg-red-500/15 text-red-700 dark:text-red-400";
  return (
    <span className={`text-xs rounded-full px-2 py-0.5 ${colorClass}`}>
      {pct}% confidence
    </span>
  );
}

// ---------------------------------------------------------------------------
// Screenshot with lightbox
// ---------------------------------------------------------------------------

interface ScreenshotProps {
  src: string | null;
  alt: string;
  aimAnchorX?: number | null;
  aimAnchorY?: number | null;
  interactive?: boolean;
  onAnchorChange?: (x: number, y: number) => void;
}

function Screenshot({
  src,
  alt,
  aimAnchorX,
  aimAnchorY,
  interactive = false,
  onAnchorChange,
}: ScreenshotProps) {
  const [lightbox, setLightbox] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleContainerClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!interactive || !onAnchorChange || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      onAnchorChange(
        Math.max(0, Math.min(1, x)),
        Math.max(0, Math.min(1, y)),
      );
    },
    [interactive, onAnchorChange],
  );

  return (
    <>
      <div
        ref={containerRef}
        className={`relative rounded-md overflow-hidden bg-muted/20 aspect-video group ${
          interactive ? "cursor-crosshair" : ""
        }`}
        onClick={interactive ? handleContainerClick : undefined}
      >
        {src ? (
          <img
            src={src}
            alt={alt}
            className="w-full h-full object-cover select-none"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
            No screenshot
          </div>
        )}

        {/* Aim anchor dot */}
        {aimAnchorX != null && aimAnchorY != null && src && (
          <div
            aria-label={`Aim anchor at ${Math.round(aimAnchorX * 100)}%, ${Math.round(aimAnchorY * 100)}%`}
            style={{
              position: "absolute",
              left: `calc(${aimAnchorX * 100}% - 8px)`,
              top: `calc(${aimAnchorY * 100}% - 8px)`,
              width: 16,
              height: 16,
              borderRadius: "50%",
              border: "2px solid rgba(239, 68, 68, 0.9)",
              background: "rgba(239, 68, 68, 0.3)",
              boxShadow: "0 0 0 1px rgba(0,0,0,0.5)",
              pointerEvents: "none",
            }}
          />
        )}

        {/* Expand icon (hover) */}
        {src && (
          <button
            type="button"
            aria-label="Enlarge screenshot"
            className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 rounded p-0.5"
            onClick={(e) => {
              e.stopPropagation();
              setLightbox(true);
            }}
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && src && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setLightbox(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Screenshot enlarged"
        >
          <img
            src={src}
            alt={alt}
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
          />
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Classification form state — wraps a single lineup's editable fields
// ---------------------------------------------------------------------------

interface ClassificationFields {
  game_id: string;
  map_id: string;
  target_zone_id: string;
  stand_zone_id: string;
  side: string;
  utility_type_id: string;
  title: string;
  notes: string;
  aim_anchor_x: string;
  aim_anchor_y: string;
  setup_seconds: string;
}

function initFieldsFromLineup(lineup: Lineup): ClassificationFields {
  // Prefer suggested values for pending lineups (empty accepted fields)
  return {
    game_id: lineup.suggested_game_id ?? lineup.game_id ?? "",
    map_id: lineup.suggested_map_id ?? lineup.map_id ?? "",
    target_zone_id: lineup.suggested_target_zone_id ?? lineup.target_zone_id ?? "",
    stand_zone_id: lineup.suggested_stand_zone_id ?? lineup.stand_zone_id ?? "",
    side: lineup.suggested_side ?? lineup.side ?? "",
    utility_type_id: lineup.suggested_utility_type_id ?? lineup.utility_type_id ?? "",
    title: lineup.title ?? "",
    notes: lineup.notes ?? "",
    aim_anchor_x:
      lineup.aim_anchor_x != null ? String(lineup.aim_anchor_x) : "",
    aim_anchor_y:
      lineup.aim_anchor_y != null ? String(lineup.aim_anchor_y) : "",
    setup_seconds:
      lineup.setup_seconds != null ? String(lineup.setup_seconds) : "",
  };
}

function fieldsToAcceptBody(fields: ClassificationFields): LineupAcceptBody {
  const body: LineupAcceptBody = {};
  if (fields.game_id) body.game_id = fields.game_id;
  if (fields.map_id) body.map_id = fields.map_id;
  if (fields.target_zone_id) body.target_zone_id = fields.target_zone_id;
  if (fields.stand_zone_id) body.stand_zone_id = fields.stand_zone_id;
  if (fields.side && ["side_a", "side_b", "any"].includes(fields.side)) {
    body.side = fields.side as "side_a" | "side_b" | "any";
  }
  if (fields.utility_type_id) body.utility_type_id = fields.utility_type_id;
  if (fields.title) body.title = fields.title;
  if (fields.notes) body.notes = fields.notes;
  const ax = parseFloat(fields.aim_anchor_x);
  if (!isNaN(ax)) body.aim_anchor_x = ax;
  const ay = parseFloat(fields.aim_anchor_y);
  if (!isNaN(ay)) body.aim_anchor_y = ay;
  const sec = parseInt(fields.setup_seconds, 10);
  if (!isNaN(sec)) body.setup_seconds = sec;
  return body;
}

// ---------------------------------------------------------------------------
// ReviewCard
// ---------------------------------------------------------------------------

interface ReviewCardProps {
  lineup: Lineup;
  checked: boolean;
  onCheckToggle: () => void;
}

function ReviewCard({ lineup, checked, onCheckToggle }: ReviewCardProps) {
  const [fields, setFields] = useState<ClassificationFields>(() =>
    initFieldsFromLineup(lineup),
  );

  const [acceptLineup, { isLoading: isAccepting }] = useAcceptLineupMutation();
  const [hideLineup, { isLoading: isHiding }] = useHideLineupMutation();
  const [reclassify, { isLoading: isReclassifying }] =
    useReclassifyLineupMutation();

  const setField = (key: keyof ClassificationFields, value: string) => {
    setFields((prev) => ({ ...prev, [key]: value }));
  };

  const handleAccept = async () => {
    const body = fieldsToAcceptBody(fields);
    try {
      await acceptLineup({ id: lineup.id, body }).unwrap();
      showSuccess("Lineup accepted.");
    } catch (err: unknown) {
      const detail =
        (err as { data?: { detail?: string } })?.data?.detail ??
        "Failed to accept lineup.";
      showError(detail);
    }
  };

  const handleHide = async () => {
    if (!window.confirm("Hide this lineup? It can be recovered from the database.")) return;
    try {
      await hideLineup(lineup.id).unwrap();
      showSuccess("Lineup hidden.");
    } catch {
      showError("Failed to hide lineup.");
    }
  };

  const handleReclassify = async () => {
    try {
      const result = await reclassify(lineup.id).unwrap();
      if (result.success) {
        // Refresh fields with new suggestions
        setFields(
          initFieldsFromLineup({
            ...lineup,
            suggested_game_id: result.suggested_game_id,
            suggested_map_id: result.suggested_map_id,
            suggested_target_zone_id: result.suggested_target_zone_id,
            suggested_stand_zone_id: result.suggested_stand_zone_id,
            suggested_side: result.suggested_side,
            suggested_utility_type_id: result.suggested_utility_type_id,
            aim_anchor_x: result.aim_anchor_x,
            aim_anchor_y: result.aim_anchor_y,
            classification_confidence: result.confidence,
            classification_reasoning: result.reasoning,
          }),
        );
        showSuccess("Re-classified.");
      } else {
        showError(
          `Classification failed: ${result.error_codes.join(", ") || "unknown error"}`,
        );
      }
    } catch {
      showError("Re-classify request failed.");
    }
  };

  const handleAnchorChange = (x: number, y: number) => {
    setField("aim_anchor_x", x.toFixed(4));
    setField("aim_anchor_y", y.toFixed(4));
  };

  const aimX =
    fields.aim_anchor_x !== "" ? parseFloat(fields.aim_anchor_x) : null;
  const aimY =
    fields.aim_anchor_y !== "" ? parseFloat(fields.aim_anchor_y) : null;

  const borderClass = confidenceBorderClass(lineup.classification_confidence);

  return (
    <div className={`rounded-lg border-2 bg-card overflow-hidden ${borderClass}`}>
      {/* Card header */}
      <div className="px-4 py-3 border-b flex items-start gap-3">
        {/* Checkbox for bulk-select */}
        <input
          type="checkbox"
          checked={checked}
          onChange={onCheckToggle}
          aria-label={`Select ${lineup.title}`}
          className="mt-1 w-4 h-4 rounded cursor-pointer accent-primary"
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm">{lineup.title}</span>
            <ConfidenceBadge confidence={lineup.classification_confidence} />
          </div>
          <div className="text-xs text-muted-foreground mt-0.5 space-x-2">
            {lineup.attribution_author && (
              <span>{lineup.attribution_author}</span>
            )}
            {lineup.chapter_title && lineup.chapter_title !== lineup.title && (
              <span className="opacity-70">{lineup.chapter_title}</span>
            )}
          </div>
        </div>
      </div>

      {/* Screenshots */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3">
        <div>
          <p className="text-xs text-muted-foreground mb-1.5 font-medium">
            Stand position
          </p>
          <Screenshot
            src={lineup.stand_screenshot_url}
            alt={`${lineup.title} — stand`}
          />
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1.5 font-medium">
            Aim reference{" "}
            <span className="opacity-60">(click to set anchor)</span>
          </p>
          <Screenshot
            src={lineup.aim_screenshot_url}
            alt={`${lineup.title} — aim`}
            aimAnchorX={aimX}
            aimAnchorY={aimY}
            interactive
            onAnchorChange={handleAnchorChange}
          />
          {/* Aim anchor coordinates */}
          <div className="flex gap-2 mt-2">
            <label className="flex-1">
              <span className="text-xs text-muted-foreground">Anchor X</span>
              <input
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={fields.aim_anchor_x}
                onChange={(e) => setField("aim_anchor_x", e.target.value)}
                className="mt-0.5 w-full h-8 rounded border border-input bg-background px-2 text-xs"
                placeholder="0.0–1.0"
              />
            </label>
            <label className="flex-1">
              <span className="text-xs text-muted-foreground">Anchor Y</span>
              <input
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={fields.aim_anchor_y}
                onChange={(e) => setField("aim_anchor_y", e.target.value)}
                className="mt-0.5 w-full h-8 rounded border border-input bg-background px-2 text-xs"
                placeholder="0.0–1.0"
              />
            </label>
          </div>
        </div>
      </div>

      {/* Classification fields grid */}
      <div className="px-3 pb-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
        <label className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">Side</span>
          <select
            value={fields.side}
            onChange={(e) => setField("side", e.target.value)}
            className="h-8 rounded border border-input bg-background px-2 text-xs"
          >
            <option value="">— choose —</option>
            <option value="side_a">Side A (Attack/T)</option>
            <option value="side_b">Side B (Defense/CT)</option>
            <option value="any">Any (both sides)</option>
          </select>
        </label>

        <label className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">Setup seconds</span>
          <input
            type="number"
            min={0}
            value={fields.setup_seconds}
            onChange={(e) => setField("setup_seconds", e.target.value)}
            className="h-8 rounded border border-input bg-background px-2 text-xs"
            placeholder="e.g. 3"
          />
        </label>

        <label className="col-span-2 sm:col-span-1 flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">Title</span>
          <input
            type="text"
            value={fields.title}
            onChange={(e) => setField("title", e.target.value)}
            className="h-8 rounded border border-input bg-background px-2 text-xs"
            placeholder="Lineup title"
          />
        </label>

        <label className="col-span-2 sm:col-span-3 flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">Notes</span>
          <input
            type="text"
            value={fields.notes}
            onChange={(e) => setField("notes", e.target.value)}
            className="h-8 rounded border border-input bg-background px-2 text-xs"
            placeholder="Optional notes"
          />
        </label>
      </div>

      {/* Reasoning (collapsed if long) */}
      {lineup.classification_reasoning && (
        <div className="px-3 pb-3">
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none hover:text-foreground">
              Classifier reasoning
            </summary>
            <p className="mt-1 whitespace-pre-wrap leading-relaxed">
              {lineup.classification_reasoning}
            </p>
          </details>
        </div>
      )}

      {/* Action buttons */}
      <div className="px-3 pb-3 flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={handleAccept}
          disabled={isAccepting}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 h-8 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          <Check className={`w-3.5 h-3.5 ${isAccepting ? "animate-pulse" : ""}`} />
          {isAccepting ? "Accepting…" : "Accept"}
        </button>

        <button
          type="button"
          onClick={handleReclassify}
          disabled={isReclassifying}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 h-8 text-xs font-medium disabled:opacity-50"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${isReclassifying ? "animate-spin" : ""}`}
          />
          {isReclassifying ? "Classifying…" : "Re-classify"}
        </button>

        <button
          type="button"
          onClick={handleHide}
          disabled={isHiding}
          className="inline-flex items-center gap-1.5 rounded-md border border-destructive/30 px-3 h-8 text-xs font-medium text-destructive disabled:opacity-50 hover:bg-destructive/10 ml-auto"
        >
          <EyeOff className="w-3.5 h-3.5" />
          {isHiding ? "Hiding…" : "Hide"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton card
// ---------------------------------------------------------------------------

function SkeletonCard() {
  return (
    <div className="rounded-lg border-2 border-border bg-card overflow-hidden animate-pulse">
      <div className="h-14 bg-muted/40 border-b" />
      <div className="grid grid-cols-2 gap-3 p-3">
        <div className="aspect-video bg-muted/40 rounded-md" />
        <div className="aspect-video bg-muted/40 rounded-md" />
      </div>
      <div className="px-3 pb-3 h-16 bg-muted/20 rounded-md mx-3" />
      <div className="px-3 pb-3 flex gap-2">
        <div className="h-8 w-24 bg-muted/40 rounded-md" />
        <div className="h-8 w-28 bg-muted/40 rounded-md" />
      </div>
    </div>
  );
}

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

  const lineups = data?.items ?? [];
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
      showSuccess(`Accepted ${accepted.length} lineup${accepted.length === 1 ? "" : "s"}.`);
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
        {/* Game filter */}
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

        {/* Confidence filter */}
        <label className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground font-medium">Confidence</span>
          <select
            value={confidenceFilter ?? ""}
            onChange={(e) => {
              const val = e.target.value === "" ? undefined : parseFloat(e.target.value);
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
            <SkeletonCard key={i} />
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
          <ClipboardList className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" aria-hidden />
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

      {/* Select-all header (when items are present) */}
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
            <Check className={`w-4 h-4 ${isBulkAccepting ? "animate-pulse" : ""}`} />
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
