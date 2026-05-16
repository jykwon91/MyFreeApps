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
import { AlertTriangle, ArrowLeft, Backpack, ImagePlus, Package, Pencil, Plus } from "lucide-react";
import { ToggleChipGroup, showSuccess } from "@platform/ui";
import { useGetGamesQuery, useGetMapDetailQuery } from "@/store/gamesApi";
import { useGetLineupsQuery, useGetZoneDensityQuery } from "@/store/lineupsApi";
import { useGetLineupPackagesQuery, usePinAllLineupPackageMutation } from "@/store/lineupPackagesApi";
import LineupCard from "@/components/lineup/LineupCard";
import MapZoneOverlay from "@/components/lineup/MapZoneOverlay";
import MapLineupPins, {
  type PinMode,
  countUnplaceableLineups,
} from "@/components/lineup/MapLineupPins";
import PinModeToggle from "@/components/lineup/PinModeToggle";
import LineupDetailPanel from "@/components/lineup/LineupDetailPanel";
import UnplaceableLineupsNotice from "@/components/lineup/UnplaceableLineupsNotice";
import KeyboardShortcutsHelp from "@/components/lineup/KeyboardShortcutsHelp";
import MinimapUploadDialog from "@/components/game/MinimapUploadDialog";
import RoundMode from "@/pages/RoundMode";
import { usePins } from "@/hooks/usePins";
import { useLoadout, computeEffectiveUtilFilter } from "@/hooks/useLoadout";
import { useMapKeyboardShortcuts } from "@/hooks/useMapKeyboardShortcuts";
import { useIsSuperuser } from "@/hooks/useIsSuperuser";
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
  const pinModeParam = searchParams.get("pins");
  const pinMode: PinMode | null =
    pinModeParam === "stand" || pinModeParam === "target" || pinModeParam === "both"
      ? pinModeParam
      : null;
  const selectedLineupId = searchParams.get("lineup");

  // Card cycling (Arrow left/right in round mode or panel)
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  // Keyboard shortcuts help overlay
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  // One-time storage-unavailable toast
  const [storageUnavailableToast, setStorageUnavailableToast] = useState(false);
  // Minimap <img> 404/network failure — falls back to text rather than broken-image icon
  const [minimapLoadFailed, setMinimapLoadFailed] = useState(false);

  const { data: games } = useGetGamesQuery();
  const {
    data: mapDetail,
    isLoading: mapLoading,
    isError: mapError,
    refetch: refetchMapDetail,
  } = useGetMapDetailQuery(
    { gameSlug: gameSlug ?? "", mapSlug: mapSlug ?? "" },
    { skip: !gameSlug || !mapSlug },
  );

  const { isSuperuser } = useIsSuperuser();
  const [showMinimapUpload, setShowMinimapUpload] = useState(false);

  const game = games?.find((g) => g.slug === gameSlug);

  const utilOptions =
    mapDetail?.utility_types.map((u) => ({
      value: u.slug,
      label: u.name,
    })) ?? [];
  const selectedUtils = util ? util.split(",").filter(Boolean) : [];

  // Loadout filter — per-(game, side) localStorage-backed set of utility slugs.
  const { loadout, toggleLoadout, clearLoadout } = useLoadout(gameSlug ?? "", side);
  const [showLoadoutPopover, setShowLoadoutPopover] = useState(false);

  // Keyboard shortcut 'l' opens the loadout popover
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "l" || e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") return;
      setShowLoadoutPopover((v) => !v);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Effective utility filter: intersection of loadout + selected util chips
  const effectiveUtils = computeEffectiveUtilFilter(loadout, selectedUtils);

  const { data: density = {} as ZoneDensity } = useGetZoneDensityQuery(
    {
      game_slug: gameSlug ?? "",
      map_slug: mapSlug ?? "",
      side: side !== "any" ? side : undefined,
      util: effectiveUtils.length > 0 ? effectiveUtils.join(",") : undefined,
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
      utility_type_slugs: effectiveUtils.length > 0 ? effectiveUtils.join(",") : util || undefined,
    },
    { skip: !gameSlug || !mapSlug || !zone },
  );

  // Packages — for the current map (no side filter here to show all packages)
  const { data: packages = [] } = useGetLineupPackagesQuery(
    {
      map_id: mapDetail?.id,
    },
    { skip: !mapDetail?.id },
  );
  const [pinAllPackage] = usePinAllLineupPackageMutation();

  // --------------------------------------------------------------------------
  // Pin system
  // --------------------------------------------------------------------------
  const pins = usePins(gameSlug ?? "", mapSlug ?? "", side);

  // Fetch all map lineups for round mode AND for the pin layer (no zone filter).
  // Pin mode shows pins across the whole map; round mode shows pinned lineups.
  const needsAllMapLineups = isRoundMode || pinMode !== null;
  const { data: allMapLineups = [], isFetching: allMapFetching } = useGetLineupsQuery(
    {
      game_slug: gameSlug ?? "",
      map_slug: mapSlug ?? "",
      side: side !== "any" ? side : undefined,
      utility_type_slugs: effectiveUtils.length > 0 ? effectiveUtils.join(",") : undefined,
    },
    { skip: !gameSlug || !mapSlug || !needsAllMapLineups },
  );

  const pinnedLineups = allMapLineups.filter((l) => pins.isPinned(l.id));

  // Unplaceable hint: lineups exist for the current filter but every one
  // lacks a resolvable map position (no explicit anchor AND the referenced
  // zone has no polygon). The hint is non-blocking — the results panel still
  // lists the lineups; only the map pin is unavailable. Use the lineup set
  // that drives the current view: the map-wide set when pins are on, the
  // zone-filtered set otherwise.
  const unplaceableSource = pinMode !== null ? allMapLineups : lineups;
  const unplaceablePinMode: PinMode = pinMode ?? "both";
  const unplaceableCount =
    unplaceableSource.length > 0
      ? countUnplaceableLineups(unplaceableSource, unplaceablePinMode)
      : 0;
  const allUnplaceable =
    unplaceableSource.length > 0 && unplaceableCount === unplaceableSource.length;

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

  // Reset minimap-load failure when navigating to a different map.
  useEffect(() => {
    setMinimapLoadFailed(false);
  }, [mapDetail?.minimap_url]);

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

  function handlePinModeChange(next: PinMode | null) {
    updateParam("pins", next);
  }

  function handlePinSelect(lineupId: string) {
    updateParam("lineup", lineupId);
  }

  function handleCloseLineupPanel() {
    updateParam("lineup", null);
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
            {isSuperuser && (
              <Link
                to={`/${gameSlug}/${mapSlug}/zones/edit`}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border bg-card hover:bg-muted/40 transition-colors min-h-[36px]"
                title="Author the clickable zone polygons for this map"
              >
                <Pencil className="w-4 h-4" />
                Edit zones
              </Link>
            )}
            {isSuperuser && (
              <button
                type="button"
                onClick={() => setShowMinimapUpload(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border bg-card hover:bg-muted/40 transition-colors min-h-[36px]"
                title="Replace this map's minimap image"
              >
                <ImagePlus className="w-4 h-4" />
                Replace minimap
              </button>
            )}
            <Link
              to={addLineupHref}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border bg-card hover:bg-muted/40 transition-colors min-h-[36px]"
            >
              <Plus className="w-4 h-4" />
              Add lineup
            </Link>
          </div>

          {isSuperuser &&
            mapDetail.zones.length > 0 &&
            mapDetail.zones.every((z) => z.polygon_points.length === 0) && (
              <div
                className="flex items-start gap-2.5 px-3 py-2.5 rounded-md border bg-amber-500/10 border-amber-500/30 text-sm"
                role="status"
              >
                <AlertTriangle
                  className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5"
                  aria-hidden
                />
                <div className="flex-1">
                  <p className="font-medium">
                    This map's zones aren't drawn yet.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Visitors will see a static minimap until you author the
                    clickable zone polygons.
                  </p>
                </div>
                <Link
                  to={`/${gameSlug}/${mapSlug}/zones/edit`}
                  className="px-3 py-1 text-sm rounded-md bg-primary text-primary-foreground hover:opacity-90 min-h-[32px] inline-flex items-center"
                >
                  Set up zones
                </Link>
              </div>
            )}

          {showMinimapUpload && (
            <MinimapUploadDialog
              mapId={mapDetail.id}
              mapName={mapDetail.name}
              onClose={() => setShowMinimapUpload(false)}
              onUploaded={() => {
                refetchMapDetail();
                setMinimapLoadFailed(false);
              }}
            />
          )}

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

              {/* Loadout filter — "My loadout" chip group above utility chips */}
              {utilOptions.length > 0 && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowLoadoutPopover((v) => !v)}
                    className={[
                      "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm border transition-colors min-h-[36px]",
                      loadout.length > 0
                        ? "bg-amber-500/10 border-amber-500/40 text-amber-700 dark:text-amber-400"
                        : "bg-card hover:bg-muted/40",
                    ].join(" ")}
                    title="Set your current loadout utilities (keyboard: l)"
                    aria-expanded={showLoadoutPopover}
                  >
                    <Backpack className="w-3.5 h-3.5" aria-hidden />
                    {loadout.length > 0 ? `Loadout (${loadout.length})` : "My loadout"}
                  </button>

                  {showLoadoutPopover && (
                    <LoadoutPopover
                      utilOptions={utilOptions}
                      loadout={loadout}
                      onToggle={toggleLoadout}
                      onClear={clearLoadout}
                      onClose={() => setShowLoadoutPopover(false)}
                    />
                  )}
                </div>
              )}

              {/* Utility chips */}
              {utilOptions.length > 0 && (
                <ToggleChipGroup
                  options={utilOptions}
                  value={selectedUtils}
                  onChange={handleUtilToggle}
                />
              )}

              {/* Packages dropdown */}
              {packages.length > 0 && (
                <PackagesDropdown
                  packages={packages}
                  pins={pins}
                  pinAllPackage={pinAllPackage}
                  onPinAllComplete={(count) => {
                    showSuccess(`Pinned ${count} lineup${count !== 1 ? "s" : ""} — entering round mode.`);
                    updateParam("round", "1");
                  }}
                />
              )}

              {/* Pin mode toggle — show per-lineup pins on the minimap */}
              <PinModeToggle mode={pinMode} onChange={handlePinModeChange} />

              {/* Round mode button */}
              <button
                type="button"
                onClick={() => updateParam("round", "1")}
                className="px-3 py-1.5 rounded-md text-sm border bg-card hover:bg-muted/40 transition-colors min-h-[36px]"
                title="Enter round mode (show pinned lineups only)"
                aria-label="Enter round mode"
              >
                Round mode
              </button>
            </div>
          </div>

          {allUnplaceable && (
            <UnplaceableLineupsNotice count={unplaceableCount} />
          )}

          {/* Map + results layout */}
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Map minimap with zone overlay */}
            <div className="flex-1 min-w-0">
              <div
                className="relative rounded-xl border overflow-hidden bg-card"
                style={{ aspectRatio: "1 / 1" }}
              >
                {mapDetail.minimap_url && !minimapLoadFailed ? (
                  <img
                    src={mapDetail.minimap_url}
                    alt={`${mapDetail.name} minimap`}
                    className="absolute inset-0 w-full h-full object-cover"
                    draggable={false}
                    onError={() => setMinimapLoadFailed(true)}
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
                {pinMode && (
                  <MapLineupPins
                    lineups={allMapLineups}
                    mode={pinMode}
                    selectedLineupId={selectedLineupId}
                    onPinSelect={handlePinSelect}
                  />
                )}
                {pinMode && !allMapFetching && allMapLineups.length === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="bg-popover/95 border rounded-md px-4 py-3 text-sm text-center shadow-md pointer-events-auto">
                      <p className="text-muted-foreground mb-2">
                        No lineups match the current filter
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          handleSideChange("any");
                          handleUtilToggle([]);
                        }}
                        className="text-primary hover:underline"
                      >
                        Clear filters
                      </button>
                    </div>
                  </div>
                )}
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

      {selectedLineupId && (
        <LineupDetailPanel
          lineupId={selectedLineupId}
          onClose={handleCloseLineupPanel}
          pins={pins}
        />
      )}
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

// ---------------------------------------------------------------------------
// LoadoutPopover
// ---------------------------------------------------------------------------

interface LoadoutPopoverProps {
  utilOptions: Array<{ value: string; label: string }>;
  loadout: string[];
  onToggle: (slug: string) => void;
  onClear: () => void;
  onClose: () => void;
}

function LoadoutPopover({ utilOptions, loadout, onToggle, onClear, onClose }: LoadoutPopoverProps) {
  return (
    <div
      className="absolute top-full left-0 mt-1 z-20 bg-card border rounded-lg shadow-lg p-3 min-w-[200px]"
      role="dialog"
      aria-label="Set your loadout utilities"
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-muted-foreground">My loadout</p>
        <button
          type="button"
          onClick={onClose}
          className="p-0.5 rounded hover:bg-muted/40 text-muted-foreground text-xs"
          aria-label="Close loadout"
        >
          ✕
        </button>
      </div>
      <p className="text-xs text-muted-foreground mb-2">
        Select utilities you have this round to narrow the filter.
      </p>
      <div className="space-y-1">
        {utilOptions.map((opt) => (
          <label
            key={opt.value}
            className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-muted/40 text-sm"
          >
            <input
              type="checkbox"
              checked={loadout.includes(opt.value)}
              onChange={() => onToggle(opt.value)}
              className="h-4 w-4 rounded"
            />
            <span>{opt.label}</span>
          </label>
        ))}
      </div>
      {loadout.length > 0 && (
        <button
          type="button"
          onClick={() => { onClear(); onClose(); }}
          className="mt-2 w-full text-xs text-muted-foreground hover:text-foreground py-1"
        >
          Clear loadout
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PackagesDropdown
// ---------------------------------------------------------------------------

import type { LineupPackage } from "@/types/game";

interface PackagesDropdownProps {
  packages: LineupPackage[];
  pins: ReturnType<typeof usePins>;
  pinAllPackage: ReturnType<typeof usePinAllLineupPackageMutation>[0];
  onPinAllComplete: (count: number) => void;
}

function PackagesDropdown({ packages, pins, pinAllPackage, onPinAllComplete }: PackagesDropdownProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);

  async function handlePinAll(pkg: LineupPackage) {
    setLoading(pkg.id);
    try {
      const result = await pinAllPackage(pkg.id).unwrap();
      for (const id of result.lineup_ids) {
        pins.pin(id);
      }
      onPinAllComplete(result.lineup_ids.length);
    } catch {
      // Error silently falls through — user sees no pin
    } finally {
      setLoading(null);
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm border bg-card hover:bg-muted/40 transition-colors min-h-[36px]"
        title="Apply a lineup package"
        aria-expanded={open}
      >
        <Package className="w-3.5 h-3.5" aria-hidden />
        Packages
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            aria-hidden
            onClick={() => setOpen(false)}
          />
          <div className="absolute top-full left-0 mt-1 z-20 bg-card border rounded-lg shadow-lg p-2 min-w-[220px]">
            <p className="text-xs font-medium text-muted-foreground px-2 pb-1">
              Pin all and enter round mode
            </p>
            {packages.map((pkg) => (
              <button
                key={pkg.id}
                type="button"
                onClick={() => handlePinAll(pkg)}
                disabled={loading === pkg.id}
                className="w-full text-left px-3 py-2 rounded-md text-sm hover:bg-muted/40 flex items-center justify-between gap-2 disabled:opacity-60"
              >
                <span className="truncate">{pkg.name}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {loading === pkg.id ? "Pinning…" : `${pkg.lineup_ids.length} lineups`}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
