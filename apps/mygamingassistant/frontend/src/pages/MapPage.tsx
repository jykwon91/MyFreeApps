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
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, HelpCircle } from "lucide-react";
import { useGetGamesQuery, useGetMapDetailQuery } from "@/store/gamesApi";
import { useGetLineupsQuery, useGetZoneDensityQuery } from "@/store/lineupsApi";
import { countUnplaceableLineups } from "@/components/lineup/MapLineupPins";
import type { PinMode } from "@/components/lineup/MapLineupPins";
import KeyboardShortcutsHelp from "@/components/lineup/KeyboardShortcutsHelp";
import GlanceBoard from "@/components/lineup/GlanceBoard";
import GlanceBoardMinimapSidebar from "@/components/lineup/GlanceBoardMinimapSidebar";
import GlanceBoardOperatorMenu from "@/components/lineup/GlanceBoardOperatorMenu";
import DesignKnobsPanel from "@/components/lineup/DesignKnobsPanel";
import { useDesignKnobs } from "@/hooks/useDesignKnobs";
import MinimapUploadDialog from "@/components/game/MinimapUploadDialog";
import RoundMode from "@/pages/RoundMode";
import StorageUnavailableBanner from "@/components/map/StorageUnavailableBanner";
import { usePins } from "@/hooks/usePins";
import { useLoadout, computeEffectiveUtilFilter } from "@/hooks/useLoadout";
import { useMapKeyboardShortcuts } from "@/hooks/useMapKeyboardShortcuts";
import { useIsSuperuser } from "@/hooks/useIsSuperuser";
import { utilDisplay } from "@/constants/utilityDisplay";
import type { ZoneDensity } from "@/types/game";

export default function MapPage() {
  const { gameSlug, mapSlug } = useParams<{ gameSlug: string; mapSlug: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const side               = searchParams.get("side")   ?? "any";
  const util               = searchParams.get("util")   ?? "";
  const isRoundMode        = searchParams.get("round")  === "1";
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

  // Direct-manipulation knobs for the storyboard tile (URL-backed).
  const { knobs } = useDesignKnobs();

  // ---------------------------------------------------------------------------
  // Filter state derived from URL
  // ---------------------------------------------------------------------------
  const utilOptions =
    mapDetail?.utility_types.map((u) => ({
      value: u.slug,
      label: utilDisplay(u.slug).chipLabel,
    })) ?? [];

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
    return (
      <main className="p-4 sm:p-8 space-y-4">
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

        {/* ── Slim sticky top bar (~40px) ─────────────────────────────── */}
        <header className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b h-10 flex items-center gap-2 px-3 shrink-0 overflow-x-auto">

          {/* Back + map name */}
          <button
            type="button"
            onClick={() => navigate(`/${gameSlug}`)}
            className="flex items-center gap-1.5 text-sm font-medium hover:text-foreground text-muted-foreground transition-colors shrink-0"
            aria-label="Back to maps"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden />
            <span className="hidden sm:inline text-xs text-muted-foreground">{game?.name ?? gameSlug} ·</span>
            <span className="text-sm font-semibold text-foreground capitalize">{mapDetail.name}</span>
          </button>

          <span className="text-border shrink-0">|</span>

          {/* Side chips */}
          <div className="flex items-center gap-0.5 shrink-0" role="group" aria-label="Side filter">
            {sideChips.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleSideChange(opt.value)}
                className={[
                  "px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-colors",
                  side === opt.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
                ].join(" ")}
                aria-pressed={side === opt.value}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <span className="text-border shrink-0">|</span>

          {/* Utility type chips */}
          {utilOptions.length > 0 && (
            <div className="flex items-center gap-0.5 shrink-0" role="group" aria-label="Utility type filter">
              {utilOptions.map((opt) => {
                const active = selectedUtils.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleUtilChipToggle(opt.value)}
                    className={[
                      "px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-colors",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
                    ].join(" ")}
                    aria-pressed={active}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Loadout chips — persistent inline toggle strip.
              Composable with utility chips; default empty = no filter.
              Keyboard shortcut 'l' from old popover removed; inline chips
              are always accessible without shortcut. */}
          {utilOptions.length > 0 && (
            <>
              <span className="text-border shrink-0">|</span>
              <div
                className="flex items-center gap-0.5 shrink-0"
                role="group"
                aria-label="Loadout filter — utilities you are carrying this round"
              >
                {utilOptions.map((opt) => {
                  const inLoadout = loadout.includes(opt.value);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => toggleLoadout(opt.value)}
                      className={[
                        "px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-colors border",
                        inLoadout
                          ? "bg-amber-500/20 border-amber-500/50 text-amber-700 dark:text-amber-400"
                          : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/60",
                      ].join(" ")}
                      aria-pressed={inLoadout}
                      title={`${inLoadout ? "Remove" : "Add"} ${opt.label} from loadout`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Help shortcut */}
          <button
            type="button"
            onClick={() => setShowShortcutsHelp(true)}
            className="p-1 rounded hover:bg-muted/40 text-muted-foreground transition-colors shrink-0"
            aria-label="Keyboard shortcuts (?)"
            title="Keyboard shortcuts"
          >
            <HelpCircle className="w-3.5 h-3.5" aria-hidden />
          </button>

          {/* Operator ⚙ menu */}
          <GlanceBoardOperatorMenu
            gameSlug={gameSlug!}
            mapSlug={mapSlug!}
            isSuperuser={isSuperuser}
            unplaceableCount={unplaceableCount}
            onReplaceMinimapClick={() => setShowMinimapUpload(true)}
          />
        </header>

        {/* ── Body: sidebar + main ─────────────────────────────────────── */}
        <div className="flex flex-1 min-h-0">

          {/* Passive minimap sidebar */}
          <aside
            className="hidden lg:block w-[200px] shrink-0 p-3 border-r overflow-y-auto sticky top-10 h-[calc(100vh-40px)]"
            aria-label="Map zone navigation"
          >
            <GlanceBoardMinimapSidebar
              minimapUrl={mapDetail.minimap_url}
              zones={mapDetail.zones}
              density={density}
            />
          </aside>

          {/* Main scrollable area */}
          <main className="flex-1 min-w-0 p-4 lg:p-6 overflow-y-auto">
            {allMapLineups.length === 0 && !allMapFetching && (
              effectiveUtils.length > 0 || side !== "any"
            ) ? (
              /* Filtered empty state */
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <p className="text-sm text-muted-foreground text-center">
                  No{effectiveUtils.length > 0 ? ` ${effectiveUtils.join("/")}` : ""} lineups
                  {side !== "any" ? ` for ${side === "side_a" ? sideA : sideB}` : ""} on this map.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    handleSideChange("any");
                    handleUtilToggle([]);
                    clearLoadout();
                  }}
                  className="text-sm text-primary hover:underline"
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <GlanceBoard
                lineups={allMapLineups}
                isFetching={allMapFetching}
                mapName={mapDetail.name}
                filteredUtils={effectiveUtils}
                side={side}
                knobs={knobs}
                showReplaceOverlay={isSuperuser}
              />
            )}

            {/* Add lineup CTA at bottom if empty and no filters */}
            {allMapLineups.length === 0 && !allMapFetching && effectiveUtils.length === 0 && side === "any" && (
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
