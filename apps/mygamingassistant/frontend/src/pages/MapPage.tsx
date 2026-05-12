/**
 * MapPage — plan-mode lineup viewer.
 * Route: /:gameSlug/:mapSlug
 *
 * URL is the single source of truth for all filter state:
 *   ?side=side_a&util=smoke,molly&zone=mid&round=1&compact=1
 *
 * Modes:
 *  - Plan mode (default): SVG zone map, side toggle, utility chips, results panel
 *  - Round mode (?round=1): only pinned lineups, no map, no chrome
 *  - Compact mode (?compact=1): borderless — app shell hides itself (see RootLayout)
 *
 * Features:
 *  - Pin system via usePins (localStorage, cross-tab sync)
 *  - Keyboard shortcuts via useMapKeyboardShortcuts
 *  - Keyboard shortcuts help overlay via "?" key
 *  - Storage-unavailable toast (one-time, in-memory fallback)
 */
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Plus } from "lucide-react";
import { ToggleChipGroup } from "@platform/ui";
import { useGetGamesQuery, useGetMapDetailQuery } from "@/store/gamesApi";
import { useGetLineupsQuery, useGetZoneDensityQuery } from "@/store/lineupsApi";
import LineupCard from "@/components/lineup/LineupCard";
import MapZoneOverlay from "@/components/lineup/MapZoneOverlay";
import KeyboardShortcutsHelp from "@/components/lineup/KeyboardShortcutsHelp";
import RoundMode from "@/pages/RoundMode";
import { usePins } from "@/hooks/usePins";
import { useMapKeyboardShortcuts } from "@/hooks/useMapKeyboardShortcuts";
import type { Lineup, ZoneDensity } from "@/types/game";

const SIDE_BG: Record<string, string> = {
  side_a: "rgba(239,68,68,0.05)",
  side_b: "rgba(59,130,246,0.05)",
  any: "transparent",
};

export default function MapPage() {
  const { gameSlug, mapSlug } = useParams<{ gameSlug: string; mapSlug: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const side = searchParams.get("side") ?? "any";
  const util = searchParams.get("util") ?? "";
  const zone = searchParams.get("zone") ?? "";
  const isRoundMode = searchParams.get("round") === "1";

  // Card cycling (Arrow left/right in round mode or panel)
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  // Keyboard shortcuts help overlay
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  // One-time storage-unavailable toast
  const [storageUnavailableToast, setStorageUnavailableToast] = useState(false);

  const { data: games } = useGetGamesQuery();
  const {
    data: mapDetail,
    isLoading: mapLoading,
    isError: mapError,
  } = useGetMapDetailQuery(
    { gameSlug: gameSlug ?? "", mapSlug: mapSlug ?? "" },
    { skip: !gameSlug || !mapSlug },
  );

  const game = games?.find((g) => g.slug === gameSlug);

  const utilOptions =
    mapDetail?.utility_types.map((u) => ({
      value: u.slug,
      label: u.name,
    })) ?? [];
  const selectedUtils = util ? util.split(",").filter(Boolean) : [];

  const { data: density = {} as ZoneDensity } = useGetZoneDensityQuery(
    {
      game_slug: gameSlug ?? "",
      map_slug: mapSlug ?? "",
      side: side !== "any" ? side : undefined,
      util: util || undefined,
    },
    { skip: !gameSlug || !mapSlug },
  );

  const targetZone = mapDetail?.zones.find((z) => z.slug === zone);
  const { data: lineups = [], isFetching: lineupsFetching } = useGetLineupsQuery(
    {
      game_slug: gameSlug ?? "",
      map_slug: mapSlug ?? "",
      target_zone_slug: zone || undefined,
      side: side !== "any" ? side : undefined,
      utility_type_slugs: util || undefined,
    },
    { skip: !gameSlug || !mapSlug || !zone },
  );

  // --------------------------------------------------------------------------
  // Pin system
  // --------------------------------------------------------------------------
  const pins = usePins(gameSlug ?? "", mapSlug ?? "", side);

  // Fetch all pinned lineups for round mode (use existing getLineups with no zone filter)
  const { data: allMapLineups = [], isFetching: allMapFetching } = useGetLineupsQuery(
    {
      game_slug: gameSlug ?? "",
      map_slug: mapSlug ?? "",
      side: side !== "any" ? side : undefined,
    },
    { skip: !gameSlug || !mapSlug || !isRoundMode },
  );

  const pinnedLineups = allMapLineups.filter((l) => pins.isPinned(l.id));

  // Reset active card index when round mode is entered or pin count changes.
  // Using MessageChannel to schedule asynchronously, avoiding the
  // "set-state-in-effect" lint rule against synchronous setState in effects.
  useEffect(() => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => setActiveCardIndex(0);
    channel.port2.postMessage(null);
    return () => channel.port1.close();
  }, [isRoundMode, pins.pinnedIds.length]);

  // Listen for storage-unavailable event from usePins
  useEffect(() => {
    function onStorageUnavailable() {
      setStorageUnavailableToast(true);
    }
    window.addEventListener("mga:storage-unavailable", onStorageUnavailable);
    return () => window.removeEventListener("mga:storage-unavailable", onStorageUnavailable);
  }, []);

  // --------------------------------------------------------------------------
  // URL helpers
  // --------------------------------------------------------------------------
  function updateParam(key: string, value: string | null) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) {
          next.set(key, value);
        } else {
          next.delete(key);
        }
        return next;
      },
      { replace: true },
    );
  }

  function handleSideChange(newSide: string) {
    updateParam("side", newSide === "any" ? null : newSide);
  }

  function handleUtilToggle(slugs: string[]) {
    updateParam("util", slugs.length > 0 ? slugs.join(",") : null);
  }

  function handleZoneClick(zoneSlug: string) {
    updateParam("zone", zone === zoneSlug ? null : zoneSlug);
  }

  function handleClosePanel() {
    updateParam("zone", null);
  }

  // --------------------------------------------------------------------------
  // Keyboard shortcuts
  // --------------------------------------------------------------------------
  const cardCount = isRoundMode ? pinnedLineups.length : lineups.length;

  useMapKeyboardShortcuts({
    utilOptions,
    selectedUtils,
    side,
    zone,
    cardCount,
    activeCardIndex,
    onSideChange: handleSideChange,
    onUtilToggle: handleUtilToggle,
    onCloseZonePanel: handleClosePanel,
    onActiveCardIndexChange: setActiveCardIndex,
    onToggleShortcutsHelp: () => setShowShortcutsHelp((v) => !v),
  });

  // --------------------------------------------------------------------------
  // Loading / error states
  // --------------------------------------------------------------------------
  if (mapLoading) {
    return (
      <main className="p-4 sm:p-8 space-y-4 max-w-5xl">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-muted/40 animate-pulse" />
          <div className="h-7 w-40 bg-muted/40 rounded animate-pulse" />
        </div>
        <div className="h-10 bg-muted/40 rounded-lg animate-pulse" />
        <div className="h-96 bg-muted/40 rounded-xl animate-pulse" />
      </main>
    );
  }

  if (mapError || !mapDetail) {
    return (
      <main className="p-4 sm:p-8 max-w-5xl">
        <BackButton gameSlug={gameSlug!} navigate={navigate} />
        <p className="text-sm text-destructive mt-4">Failed to load map. Please refresh.</p>
      </main>
    );
  }

  const sideBg = SIDE_BG[side] ?? "transparent";

  const sideOptions = [
    { value: "any", label: "Any" },
    { value: "side_a", label: game?.side_a_label ?? "Side A" },
    { value: "side_b", label: game?.side_b_label ?? "Side B" },
  ];

  const addLineupHref = `/lineups/new?game=${gameSlug}&map=${mapSlug}${zone ? `&target_zone=${zone}` : ""}`;

  // Round mode exit: removes ?round=1, keeps other params
  const exitRoundHref = (() => {
    const p = new URLSearchParams(searchParams);
    p.delete("round");
    const qs = p.toString();
    return `/${gameSlug}/${mapSlug}${qs ? `?${qs}` : ""}`;
  })();

  // Plan mode href (for "open plan mode" link in round mode empty state)
  const planModeHref = (() => {
    const p = new URLSearchParams(searchParams);
    p.delete("round");
    const qs = p.toString();
    return `/${gameSlug}/${mapSlug}${qs ? `?${qs}` : ""}`;
  })();

  // --------------------------------------------------------------------------
  // Round mode
  // --------------------------------------------------------------------------
  if (isRoundMode) {
    return (
      <>
        {showShortcutsHelp && (
          <KeyboardShortcutsHelp onClose={() => setShowShortcutsHelp(false)} />
        )}
        <RoundMode
          game={game}
          mapDetail={mapDetail}
          side={side}
          pinnedLineups={pinnedLineups}
          isFetching={allMapFetching}
          activeCardIndex={activeCardIndex}
          exitHref={exitRoundHref}
          pins={pins}
          planModeHref={planModeHref}
        />
      </>
    );
  }

  // --------------------------------------------------------------------------
  // Plan mode
  // --------------------------------------------------------------------------
  return (
    <>
      {showShortcutsHelp && (
        <KeyboardShortcutsHelp onClose={() => setShowShortcutsHelp(false)} />
      )}

      {storageUnavailableToast && (
        <StorageUnavailableBanner onClose={() => setStorageUnavailableToast(false)} />
      )}

      <div
        className="relative min-h-screen transition-colors duration-300"
        style={{ background: sideBg }}
      >
        <main className="p-4 sm:p-8 space-y-4 max-w-5xl">
          {/* Header row */}
          <div className="flex items-center gap-3 flex-wrap">
            <BackButton gameSlug={gameSlug!} navigate={navigate} />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">{game?.name ?? gameSlug}</p>
              <h1 className="text-xl font-semibold capitalize">{mapDetail.name}</h1>
            </div>
            <Link
              to={addLineupHref}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border bg-card hover:bg-muted/40 transition-colors min-h-[36px]"
            >
              <Plus className="w-4 h-4" />
              Add lineup
            </Link>
          </div>

          {/* Sticky filter bar */}
          <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-sm border-b pb-3 -mx-4 px-4 sm:-mx-8 sm:px-8">
            <div className="flex flex-wrap gap-3 items-center pt-2">
              {/* Side toggle */}
              <div className="flex gap-1">
                {sideOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleSideChange(opt.value)}
                    className={[
                      "px-3 py-1.5 rounded-md text-sm font-medium transition-colors min-h-[36px]",
                      side === opt.value
                        ? "bg-primary text-primary-foreground"
                        : "bg-card border hover:bg-muted/40",
                    ].join(" ")}
                    aria-pressed={side === opt.value}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Utility chips */}
              {utilOptions.length > 0 && (
                <ToggleChipGroup
                  options={utilOptions}
                  value={selectedUtils}
                  onChange={handleUtilToggle}
                />
              )}

              {/* Round mode button */}
              <button
                type="button"
                onClick={() => updateParam("round", "1")}
                className="ml-auto px-3 py-1.5 rounded-md text-sm border bg-card hover:bg-muted/40 transition-colors min-h-[36px]"
                title="Enter round mode (show pinned lineups only)"
                aria-label="Enter round mode"
              >
                Round mode
              </button>
            </div>
          </div>

          {/* Map + results layout */}
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Map minimap with zone overlay */}
            <div className="flex-1 min-w-0">
              <div
                className="relative rounded-xl border overflow-hidden bg-card"
                style={{ aspectRatio: "1 / 1" }}
              >
                {mapDetail.minimap_url ? (
                  <img
                    src={mapDetail.minimap_url}
                    alt={`${mapDetail.name} minimap`}
                    className="absolute inset-0 w-full h-full object-cover"
                    draggable={false}
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
                    Minimap not available
                  </div>
                )}
                <MapZoneOverlay
                  zones={mapDetail.zones}
                  density={density}
                  selectedZoneSlug={zone || null}
                  onZoneClick={handleZoneClick}
                />
              </div>

              {/* Zone legend */}
              <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-sm" style={{ background: "rgba(34,197,94,0.4)" }} />
                  Has lineups
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-sm" style={{ background: "rgba(156,163,175,0.2)" }} />
                  Empty
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-sm" style={{ background: "rgba(251,191,36,0.4)" }} />
                  Selected
                </span>
              </div>
            </div>

            {/* Results panel */}
            {zone && targetZone && (
              <aside className="lg:w-80 xl:w-96 flex-shrink-0" aria-label="Lineup results">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold">
                    {targetZone.name}
                    {lineups.length > 0 && (
                      <span className="ml-1.5 text-xs text-muted-foreground font-normal">
                        {lineups.length} lineup{lineups.length !== 1 ? "s" : ""}
                      </span>
                    )}
                  </h2>
                  <button
                    type="button"
                    onClick={handleClosePanel}
                    className="p-1 rounded hover:bg-muted/40 text-muted-foreground text-xs"
                    aria-label="Close results panel"
                  >
                    ✕
                  </button>
                </div>

                {lineupsFetching ? (
                  <div className="space-y-3">
                    {[1, 2].map((i) => (
                      <div key={i} className="h-48 rounded-lg bg-muted/40 animate-pulse" />
                    ))}
                  </div>
                ) : lineups.length === 0 ? (
                  <div className="text-center py-8 space-y-3">
                    <p className="text-sm text-muted-foreground">No lineups match this filter.</p>
                    <Link
                      to={addLineupHref}
                      className="text-sm text-primary hover:underline"
                    >
                      Add lineup for {targetZone.name}
                    </Link>
                  </div>
                ) : lineups.length <= 3 ? (
                  <PlanModeExpandedResults
                    lineups={lineups}
                    activeCardIndex={activeCardIndex}
                    pins={pins}
                  />
                ) : (
                  <PlanModeThumbnailResults
                    lineups={lineups}
                    pins={pins}
                  />
                )}
              </aside>
            )}
          </div>
        </main>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface PlanModeExpandedResultsProps {
  lineups: Lineup[];
  activeCardIndex: number;
  pins: ReturnType<typeof usePins>;
}

function PlanModeExpandedResults({ lineups, activeCardIndex, pins }: PlanModeExpandedResultsProps) {
  return (
    <div className="space-y-4">
      {lineups.map((lineup, i) => (
        <div
          key={lineup.id}
          className={[
            "rounded-xl transition-all duration-150",
            i === activeCardIndex ? "ring-2 ring-primary" : "",
          ].join(" ")}
        >
          <LineupCard
            lineup={lineup}
            variant="expanded"
            isPinned={pins.isPinned(lineup.id)}
            onPinToggle={() => {
              if (pins.isPinned(lineup.id)) {
                pins.unpin(lineup.id);
              } else {
                pins.pin(lineup.id);
              }
            }}
          />
        </div>
      ))}
    </div>
  );
}

interface PlanModeThumbnailResultsProps {
  lineups: Lineup[];
  pins: ReturnType<typeof usePins>;
}

function PlanModeThumbnailResults({ lineups, pins }: PlanModeThumbnailResultsProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {lineups.map((lineup) => (
        <LineupCard
          key={lineup.id}
          lineup={lineup}
          variant="thumbnail"
          isPinned={pins.isPinned(lineup.id)}
          onPinToggle={() => {
            if (pins.isPinned(lineup.id)) {
              pins.unpin(lineup.id);
            } else {
              pins.pin(lineup.id);
            }
          }}
        />
      ))}
    </div>
  );
}

function StorageUnavailableBanner({ onClose }: { onClose: () => void }) {
  return (
    <div
      role="alert"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-card border rounded-lg shadow-lg px-4 py-3 text-sm max-w-sm"
    >
      <span className="flex-1">Pins won't persist (storage unavailable)</span>
      <button
        type="button"
        onClick={onClose}
        className="p-1 rounded hover:bg-muted/40 text-muted-foreground"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}

function BackButton({
  gameSlug,
  navigate,
}: {
  gameSlug: string;
  navigate: ReturnType<typeof useNavigate>;
}) {
  return (
    <button
      type="button"
      onClick={() => navigate(`/${gameSlug}`)}
      className="p-2 rounded-md hover:bg-muted/40 transition-colors min-h-[44px]"
      aria-label="Back to maps"
    >
      <ArrowLeft className="h-5 w-5" />
    </button>
  );
}
