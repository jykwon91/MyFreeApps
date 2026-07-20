/**
 * MapPage — CS2 lineup glance board.
 * Route: /:gameSlug/:mapSlug
 *
 * Second-monitor design: every lineup for the open map is a full-size tile,
 * all visible at once, grouped by target zone, vertical scroll. No click to
 * expand anything — the detail IS the default state.
 *
 * URL is the single source of truth for all filter state:
 *   ?side=side_a&util=smoke,molly&loadout=smoke,flash&round=1&compact=1
 *
 * Layout:
 *   ┌─────────────────────────────────────────────────────┐
 *   │ Slim sticky top bar (~40px)                         │
 *   │ ← Game · MapName | T/CT/Both | util chips | loadout │
 *   │                                    chips | ⚙        │
 *   ├──────────────┬──────────────────────────────────────┤
 *   │ Sidebar      │ Main scroll area                     │
 *   │ (~200px)     │                                      │
 *   │ Minimap +    │ ━━ A SITE (n) ━━                     │
 *   │ zone SVG     │ [tile] [tile]                        │
 *   │              │ ━━ B SITE (n) ━━                     │
 *   │              │ ...                                  │
 *   └──────────────┴──────────────────────────────────────┘
 *
 * Modes:
 *  - Glance board (default): full-size tiles, all lineups visible
 *  - Round mode (?round=1): only pinned lineups, no map, no chrome
 *  - Compact mode (?compact=1): borderless — app shell hides itself
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, X } from "lucide-react";
import { useGetGamesQuery, useGetMapDetailQuery } from "@/store/gamesApi";
import { useGetLineupsQuery, useGetZoneDensityQuery } from "@/store/lineupsApi";
import { countUnplaceableLineups } from "@/components/lineup/MapLineupPins";
import type { PinMode } from "@/components/lineup/MapLineupPins";
import KeyboardShortcutsHelp from "@/components/lineup/KeyboardShortcutsHelp";
import GlanceBoard from "@/components/lineup/GlanceBoard";
import LineupListBoard from "@/components/lineup/LineupListBoard";
import MapSpatialSidebar from "@/components/lineup/MapSpatialSidebar";
import MapPageTopBar from "@/components/map/MapPageTopBar";
import MapPageSkeleton from "@/components/map/MapPageSkeleton";
import DesignKnobsPanel from "@/components/lineup/DesignKnobsPanel";
import { useDesignKnobs } from "@/hooks/useDesignKnobs";
import MinimapUploadDialog from "@/components/game/MinimapUploadDialog";
import RoundMode from "@/pages/RoundMode";
import StorageUnavailableBanner from "@/components/map/StorageUnavailableBanner";
import { usePins } from "@/hooks/usePins";
import { useLoadout, computeEffectiveUtilFilter } from "@/hooks/useLoadout";
import { useAgentFilter } from "@/hooks/useAgentFilter";
import { useMapKeyboardShortcuts } from "@/hooks/useMapKeyboardShortcuts";
import { useIsSuperuser } from "@/hooks/useIsSuperuser";
import { buildUtilOptions } from "@/constants/utilityDisplay";
import type { ZoneDensity } from "@/types/game";

export default function MapPage() {
  const { gameSlug, mapSlug } = useParams<{ gameSlug: string; mapSlug: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const side               = searchParams.get("side")   ?? "any";
  const util               = searchParams.get("util")   ?? "";
  const isRoundMode        = searchParams.get("round")  === "1";
  // Zone filter — narrows the rendered lineups to a single target zone.
  // Set by clicking a zone polygon (or zone-name in the fallback list)
  // on the minimap sidebar. Click the active zone again to clear.
  const zoneFilter         = searchParams.get("zone")   ?? null;
  // Render mode — list (default; compact rows, click-to-expand storyboard)
  // or grid (the original full-tile glance-board). List view is the default
  // because the grid mounts up to 4 looping <video> tags per visible card,
  // pushing browser CPU to ~10% on a dense map. List defers all video
  // decoding until the operator clicks a specific row.
  const viewMode           = searchParams.get("view") === "grid" ? "grid" : "list";
  const pinModeParam       = searchParams.get("pins");
  const pinMode: PinMode | null =
    pinModeParam === "stand" || pinModeParam === "target" || pinModeParam === "both"
      ? pinModeParam
      : null;

  const [showShortcutsHelp,   setShowShortcutsHelp]   = useState(false);
  const [storageUnavailableToast, setStorageUnavailableToast] = useState(false);
  const [showMinimapUpload,   setShowMinimapUpload]    = useState(false);
  // Card cycling — used by round mode + keyboard shortcuts
  const [activeCardIndex,     setActiveCardIndex]      = useState(0);

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
  const game = games?.find((g) => g.slug === gameSlug);
  // Valorant gains an agent dimension above the utility chips; CS2 does not.
  const isValorant = game?.slug === "valorant";

  // Direct-manipulation knobs for the storyboard tile (URL-backed).
  const { knobs } = useDesignKnobs();

  // ---------------------------------------------------------------------------
  // Filter state derived from URL
  // ---------------------------------------------------------------------------
  const selectedUtils = util ? util.split(",").filter(Boolean) : [];

  // Loadout filter — persistent inline chips in the top bar.
  // Default loadout = empty = "no loadout filter applied" (show all).
  // State lives in useLoadout (localStorage-backed). Filter chips always
  // visible; compose with the utility chips.
  const { loadout, toggleLoadout, clearLoadout } = useLoadout(gameSlug ?? "", side);

  const effectiveUtils = computeEffectiveUtilFilter(loadout, selectedUtils);

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------
  const { data: density = {} as ZoneDensity } = useGetZoneDensityQuery(
    {
      game_slug: gameSlug ?? "",
      map_slug:  mapSlug  ?? "",
      side:      side !== "any" ? side : undefined,
      util:      effectiveUtils.length > 0 ? effectiveUtils.join(",") : undefined,
    },
    { skip: !gameSlug || !mapSlug },
  );

  // Glance board always fetches all map lineups (no zone filter).
  const {
    data: allMapLineups = [],
    isFetching: allMapFetching,
  } = useGetLineupsQuery(
    {
      game_slug:            gameSlug ?? "",
      map_slug:             mapSlug  ?? "",
      side:                 side !== "any" ? side : undefined,
      utility_type_slugs:   effectiveUtils.length > 0 ? effectiveUtils.join(",") : undefined,
    },
    { skip: !gameSlug || !mapSlug },
  );

  // ---------------------------------------------------------------------------
  // Agent dimension (Valorant only). The dropdown options + the filter derive
  // from the already-loaded lineups, so the agent filter is applied client-side
  // below (passing agent_slugs to the query would collapse the dropdown to the
  // selected agent). CS2 → every output is the inert "no agent layer".
  // ---------------------------------------------------------------------------
  const {
    selectedAgent,
    agentGroups,
    agentUtilSlugs,
    onAgentChange,
    filterByAgent,
  } = useAgentFilter({
    isValorant,
    agents:       mapDetail?.agents ?? [],
    utilityTypes: mapDetail?.utility_types ?? [],
    lineups:      allMapLineups,
  });

  // Utility-chip options — see buildUtilOptions (Valorant agent-scoped chips /
  // CS2 present-utilities-only, both display-ordered).
  const utilOptions = useMemo(
    () =>
      buildUtilOptions({
        isValorant,
        hasSelectedAgent: Boolean(selectedAgent),
        agentUtilSlugs,
        utilityTypes: mapDetail?.utility_types ?? [],
        presentSlugs: mapDetail?.present_utility_type_slugs ?? [],
      }),
    [mapDetail, isValorant, selectedAgent, agentUtilSlugs],
  );

  // ---------------------------------------------------------------------------
  // Pin system (used by round mode)
  // ---------------------------------------------------------------------------
  const pins          = usePins(gameSlug ?? "", mapSlug ?? "", side);
  const pinnedLineups = allMapLineups.filter((l) => pins.isPinned(l.id));

  // Unplaceable count — for operator ⚙ menu notice
  const unplaceableCount =
    allMapLineups.length > 0
      ? countUnplaceableLineups(allMapLineups, pinMode ?? "both")
      : 0;

  // Reset active card index when round mode is entered or pin count changes.
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

  // ---------------------------------------------------------------------------
  // URL helpers
  // ---------------------------------------------------------------------------
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

  // Individual util chip toggle (for top-bar chips that toggle one at a time)
  function handleUtilChipToggle(slug: string) {
    const next = selectedUtils.includes(slug)
      ? selectedUtils.filter((s) => s !== slug)
      : [...selectedUtils, slug];
    handleUtilToggle(next);
  }

  // Zone-filter toggle — clicking the active zone clears the filter so the
  // minimap polygon acts as a two-state toggle (apply / clear). Switching
  // to a different zone replaces the filter. Side / util / view filters are
  // preserved across zone changes.
  function handleZoneClick(slug: string) {
    updateParam("zone", slug === zoneFilter ? null : slug);
  }

  function handleViewToggle(next: "list" | "grid") {
    // Persist "grid" explicitly; "list" is the default so we strip the
    // param to keep URLs short.
    updateParam("view", next === "grid" ? "grid" : null);
  }

  // Pre-filter the fetched lineups by zone slug on the client. The /api
  // /lineups endpoint takes a target_zone_id, not a slug, so client-side
  // filtering is cheaper than another round-trip + a slug→ID resolver per
  // click. Lineups whose target_zone is null never match a zone filter.
  const visibleLineups = useMemo(() => {
    let list = filterByAgent(allMapLineups);
    if (zoneFilter) list = list.filter((l) => l.target_zone?.slug === zoneFilter);
    return list;
  }, [allMapLineups, filterByAgent, zoneFilter]);

  const activeZone = zoneFilter
    ? mapDetail?.zones?.find((z) => z.slug === zoneFilter) ?? null
    : null;

  // ---------------------------------------------------------------------------
  // Keyboard shortcuts (kept for power users — ? for help)
  // ---------------------------------------------------------------------------
  const cardCount = isRoundMode ? pinnedLineups.length : allMapLineups.length;

  useMapKeyboardShortcuts({
    utilOptions,
    selectedUtils,
    side,
    zone: "",
    cardCount,
    activeCardIndex,
    onSideChange:             handleSideChange,
    onUtilToggle:             handleUtilToggle,
    onCloseZonePanel:         () => {},
    onActiveCardIndexChange:  setActiveCardIndex,
    onToggleShortcutsHelp:    () => setShowShortcutsHelp((v) => !v),
  });

  // ---------------------------------------------------------------------------
  // Round mode exit href
  // ---------------------------------------------------------------------------
  const exitRoundHref = (() => {
    const p = new URLSearchParams(searchParams);
    p.delete("round");
    const qs = p.toString();
    return `/${gameSlug}/${mapSlug}${qs ? `?${qs}` : ""}`;
  })();

  const planModeHref = exitRoundHref;

  // ---------------------------------------------------------------------------
  // Loading / error states
  // ---------------------------------------------------------------------------
  if (mapLoading) {
    return <MapPageSkeleton />;
  }

  if (mapError || !mapDetail) {
    return (
      <main className="p-4 sm:p-8">
        <button
          type="button"
          onClick={() => navigate(`/${gameSlug}`)}
          className="p-2 rounded-md hover:bg-muted/40 transition-colors min-h-[44px]"
          aria-label="Back to maps"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <p className="text-sm text-destructive mt-4">Failed to load map. Please refresh.</p>
      </main>
    );
  }

  // ---------------------------------------------------------------------------
  // Round mode
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // Side chip helpers
  // ---------------------------------------------------------------------------
  const sideA  = game?.side_a_label ?? "T";
  const sideB  = game?.side_b_label ?? "CT";

  const sideChips = [
    { value: "side_a", label: sideA },
    { value: "side_b", label: sideB },
    { value: "any",    label: "Both" },
  ];

  // ---------------------------------------------------------------------------
  // Glance board
  // ---------------------------------------------------------------------------
  return (
    <>
      {showShortcutsHelp && (
        <KeyboardShortcutsHelp onClose={() => setShowShortcutsHelp(false)} />
      )}

      {storageUnavailableToast && (
        <StorageUnavailableBanner onClose={() => setStorageUnavailableToast(false)} />
      )}

      {showMinimapUpload && (
        <MinimapUploadDialog
          mapId={mapDetail.id}
          mapName={mapDetail.name}
          onClose={() => setShowMinimapUpload(false)}
          onUploaded={() => {
            refetchMapDetail();
          }}
        />
      )}

      {/* ── Full-height flex container ──────────────────────────────────── */}
      <div className="flex flex-col min-h-screen">

        <MapPageTopBar
          gameSlug={gameSlug!}
          mapSlug={mapSlug!}
          gameName={game?.name ?? gameSlug ?? ""}
          mapName={mapDetail.name}
          side={side}
          sideChips={sideChips}
          onSideChange={handleSideChange}
          agentGroups={agentGroups}
          selectedAgent={selectedAgent}
          onAgentChange={onAgentChange}
          utilOptions={utilOptions}
          selectedUtils={selectedUtils}
          onUtilChipToggle={handleUtilChipToggle}
          loadout={loadout}
          onLoadoutToggle={toggleLoadout}
          viewMode={viewMode}
          onViewToggle={handleViewToggle}
          isSuperuser={isSuperuser}
          unplaceableCount={unplaceableCount}
          onReplaceMinimapClick={() => setShowMinimapUpload(true)}
          onBackClick={() => navigate(`/${gameSlug}`)}
          onShortcutsClick={() => setShowShortcutsHelp(true)}
        />

        {/* ── Body: sidebar + main ─────────────────────────────────────── */}
        <div className="flex flex-1 min-h-0">

          {/* Minimap sidebar — polygon clicks now set the zone filter via
              handleZoneClick. The active zone (if any) is highlighted. */}
          <aside
            className="hidden lg:block w-[440px] shrink-0 p-3 border-r overflow-y-auto sticky top-10 h-[calc(100vh-40px)]"
            aria-label="Map zone navigation"
          >
            <MapSpatialSidebar
              minimapUrl={mapDetail.minimap_url}
              zones={mapDetail.zones}
              density={density}
              onZoneClick={handleZoneClick}
              activeZoneSlug={zoneFilter}
              lineups={allMapLineups}
              pinMode={pinMode}
              onPinModeChange={(m) => updateParam("pins", m)}
              isSuperuser={isSuperuser}
            />
          </aside>

          {/* Main scrollable area */}
          <main className="flex-1 min-w-0 p-4 lg:p-6 overflow-y-auto">

            {/* Active zone-filter chip — only when a zone is selected.
                Click the × to clear; clicking the active zone polygon on
                the minimap also clears (toggle behaviour). */}
            {activeZone && (
              <div className="mb-4 flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Filtered to:</span>
                <button
                  type="button"
                  onClick={() => updateParam("zone", null)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-primary/15 text-primary hover:bg-primary/25 transition-colors"
                  aria-label={`Clear zone filter (currently ${activeZone.name})`}
                >
                  <span>{activeZone.name}</span>
                  <X className="w-3 h-3" aria-hidden />
                </button>
                <span className="text-xs text-muted-foreground">
                  ({visibleLineups.length} lineup{visibleLineups.length !== 1 ? "s" : ""})
                </span>
              </div>
            )}

            {visibleLineups.length === 0 && !allMapFetching && (
              effectiveUtils.length > 0 || side !== "any" || zoneFilter || selectedAgent
            ) ? (
              /* Filtered empty state */
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <p className="text-sm text-muted-foreground text-center">
                  No{effectiveUtils.length > 0 ? ` ${effectiveUtils.join("/")}` : ""} lineups
                  {side !== "any" ? ` for ${side === "side_a" ? sideA : sideB}` : ""}
                  {activeZone ? ` in ${activeZone.name}` : ""}.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    handleSideChange("any");
                    handleUtilToggle([]);
                    clearLoadout();
                    updateParam("zone", null);
                    onAgentChange("");
                  }}
                  className="text-sm text-primary hover:underline"
                >
                  Clear filters
                </button>
              </div>
            ) : viewMode === "list" ? (
              <LineupListBoard
                lineups={visibleLineups}
                isFetching={allMapFetching}
                mapName={mapDetail.name}
                filteredUtils={effectiveUtils}
                side={side}
                game={game}
                knobs={knobs}
                showOperatorOverlays={isSuperuser}
              />
            ) : (
              <GlanceBoard
                lineups={visibleLineups}
                isFetching={allMapFetching}
                mapName={mapDetail.name}
                filteredUtils={effectiveUtils}
                side={side}
                knobs={knobs}
                showOperatorOverlays={isSuperuser}
              />
            )}

            {/* Add lineup CTA at bottom if completely empty (no lineups AND
                no filters applied) — the truly-empty-map state. */}
            {allMapLineups.length === 0 && !allMapFetching && effectiveUtils.length === 0 && side === "any" && !zoneFilter && (
              <div className="mt-6 text-center">
                <Link
                  to={`/lineups/new?game=${gameSlug}&map=${mapSlug}`}
                  className="text-sm text-primary hover:underline"
                >
                  Add the first lineup for {mapDetail.name}
                </Link>
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Floating direct-manipulation knobs panel (collapsed by default). */}
      <DesignKnobsPanel />
    </>
  );
}
