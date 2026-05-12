/**
 * MapPage — plan-mode lineup viewer.
 * Route: /:gameSlug/:mapSlug
 *
 * URL is the single source of truth for all filter state:
 *   ?side=side_a&util=smoke,molly&zone=a-site
 *
 * Features:
 * - Sticky top bar: side toggle + utility chips + "Add lineup" link
 * - Side-aware background tint (orange/red for side_a, blue/cyan for side_b)
 * - Map minimap with SVG zone polygon overlay (density-colored, always visible)
 * - Click zone → show lineup results panel
 * - Results: expanded cards (1-3 results) or thumbnail grid (4+)
 * - Esc or background click → clear zone
 */
import { useCallback, useEffect } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Plus } from "lucide-react";
import { ToggleChipGroup } from "@platform/ui";
import { useGetGamesQuery, useGetMapDetailQuery } from "@/store/gamesApi";
import { useGetLineupsQuery, useGetZoneDensityQuery } from "@/store/lineupsApi";
import LineupCard from "@/components/lineup/LineupCard";
import MapZoneOverlay from "@/components/lineup/MapZoneOverlay";
import type { ZoneDensity } from "@/types/game";

const SIDE_BG: Record<string, string> = {
  side_a: "rgba(239,68,68,0.05)",
  side_b: "rgba(59,130,246,0.05)",
  any: "transparent",
};

export default function MapPage() {
  const { gameSlug, mapSlug } = useParams<{ gameSlug: string; mapSlug: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const side = searchParams.get("side") ?? "any";
  const util = searchParams.get("util") ?? "";
  const zone = searchParams.get("zone") ?? "";

  const { data: games } = useGetGamesQuery();
  const { data: mapDetail, isLoading: mapLoading, isError: mapError } = useGetMapDetailQuery(
    { gameSlug: gameSlug ?? "", mapSlug: mapSlug ?? "" },
    { skip: !gameSlug || !mapSlug },
  );

  const game = games?.find((g) => g.slug === gameSlug);

  // Utility chip options from the game's utility types (from mapDetail)
  const utilOptions = mapDetail?.utility_types.map((u) => ({
    value: u.slug,
    label: u.name,
  })) ?? [];
  const selectedUtils = util ? util.split(",").filter(Boolean) : [];

  // Zone density query — drives polygon coloring
  const { data: density = {} as ZoneDensity } = useGetZoneDensityQuery(
    {
      game_slug: gameSlug ?? "",
      map_slug: mapSlug ?? "",
      side: side !== "any" ? side : undefined,
      util: util || undefined,
    },
    { skip: !gameSlug || !mapSlug },
  );

  // Lineup results for the selected zone
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

  // URL helpers
  function updateParam(key: string, value: string | null) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) {
        next.set(key, value);
      } else {
        next.delete(key);
      }
      return next;
    }, { replace: true });
  }

  function handleSideChange(newSide: string) {
    updateParam("side", newSide === "any" ? null : newSide);
  }

  function handleUtilToggle(slugs: string[]) {
    updateParam("util", slugs.length > 0 ? slugs.join(",") : null);
  }

  function handleZoneClick(zoneSlug: string) {
    // Toggle: clicking the already-selected zone deselects it
    if (zone === zoneSlug) {
      updateParam("zone", null);
    } else {
      updateParam("zone", zoneSlug);
    }
  }

  function handleClosePanel() {
    updateParam("zone", null);
  }

  // Esc key closes the zone panel
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && zone) {
        handleClosePanel();
      }
    },
    [zone], // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Loading skeleton
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
        <BackButton gameSlug={gameSlug!} />
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

  return (
    <div
      className="relative min-h-screen transition-colors duration-300"
      style={{ background: sideBg }}
    >
      <main className="p-4 sm:p-8 space-y-4 max-w-5xl">
        {/* Header row */}
        <div className="flex items-center gap-3 flex-wrap">
          <BackButton gameSlug={gameSlug!} />
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

            {/* Zone legend (small) */}
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
                <div className="space-y-4">
                  {lineups.map((lineup) => (
                    <LineupCard key={lineup.id} lineup={lineup} variant="expanded" />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {lineups.map((lineup) => (
                    <LineupCard key={lineup.id} lineup={lineup} variant="thumbnail" />
                  ))}
                </div>
              )}
            </aside>
          )}
        </div>
      </main>
    </div>
  );
}

function BackButton({ gameSlug }: { gameSlug: string }) {
  const navigate = useNavigate();
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
