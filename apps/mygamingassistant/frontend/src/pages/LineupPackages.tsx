/**
 * LineupPackages page — manage named bundles of lineups.
 * Route: /packages
 *
 * Features:
 *  - List packages filtered by game / map / side
 *  - Create package dialog: name + lineup selection (for current game/map/side)
 *  - Pin all button: calls pinAll endpoint, then iterates and pins each lineup
 *  - Edit (rename) inline within each row
 *  - Delete with confirmation
 */
import { useState } from "react";
import { Package, Plus } from "lucide-react";
import { useGetGamesQuery, useGetMapsQuery } from "@/store/gamesApi";
import { useGetLineupPackagesQuery } from "@/store/lineupPackagesApi";
import type { GameMap } from "@/types/game";
import CreatePackageDialog from "@/components/game/CreatePackageDialog";
import PackageRow from "@/components/game/PackageRow";

export default function LineupPackages() {
  const [filterGameId, setFilterGameId] = useState<string>("");
  const [filterMapId, setFilterMapId] = useState<string>("");
  const [filterSide, setFilterSide] = useState<string>("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const { data: games = [] } = useGetGamesQuery();
  const { data: maps = [] } = useGetMapsQuery(
    games.find((g) => g.id === filterGameId)?.slug ?? "",
    { skip: !filterGameId },
  );

  const { data: packages = [], isLoading, isError } = useGetLineupPackagesQuery({
    game_id: filterGameId || undefined,
    map_id: filterMapId || undefined,
    side: filterSide || undefined,
  });

  const selectedGame = games.find((g) => g.id === filterGameId);
  const selectedMap = (maps as GameMap[]).find((m) => m.id === filterMapId);

  const sideOptions: Array<{ value: string; label: string }> = [
    { value: "", label: "Any side" },
    { value: "side_a", label: selectedGame?.side_a_label ?? "Side A" },
    { value: "side_b", label: selectedGame?.side_b_label ?? "Side B" },
    { value: "any", label: "Any (both)" },
  ];

  return (
    <main className="p-4 sm:p-8 space-y-6 max-w-3xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Lineup Packages</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Named bundles of lineups — e.g. "Full B exec", "Pistol round CT".
            Use "Pin all" to queue a package for round mode.
          </p>
        </div>
        <button
          onClick={() => setShowCreateDialog(true)}
          disabled={!filterGameId || !filterMapId}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
          title={!filterGameId || !filterMapId ? "Select a game and map first" : undefined}
        >
          <Plus className="w-4 h-4" />
          New package
        </button>
      </div>

      {/* Filters */}
      <section aria-label="Filters" className="flex flex-wrap gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="filter-game" className="text-xs font-medium text-muted-foreground">
            Game
          </label>
          <select
            id="filter-game"
            value={filterGameId}
            onChange={(e) => {
              setFilterGameId(e.target.value);
              setFilterMapId("");
            }}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">All games</option>
            {games.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>

        {filterGameId && (
          <div className="flex flex-col gap-1">
            <label htmlFor="filter-map" className="text-xs font-medium text-muted-foreground">
              Map
            </label>
            <select
              id="filter-map"
              value={filterMapId}
              onChange={(e) => setFilterMapId(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">All maps</option>
              {(maps as GameMap[]).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {filterGameId && (
          <div className="flex flex-col gap-1">
            <label htmlFor="filter-side" className="text-xs font-medium text-muted-foreground">
              Side
            </label>
            <select
              id="filter-side"
              value={filterSide}
              onChange={(e) => setFilterSide(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              {sideOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </section>

      {/* Package list */}
      <section aria-label="Packages">
        {isLoading && (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-20 rounded-lg bg-muted/40 animate-pulse" aria-hidden />
            ))}
          </div>
        )}

        {isError && (
          <p className="text-sm text-destructive">Failed to load packages. Please refresh.</p>
        )}

        {!isLoading && !isError && packages.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm space-y-2">
            <Package className="w-8 h-8 mx-auto opacity-30" />
            <p>
              {filterGameId
                ? "No packages match the current filter."
                : "No packages yet. Select a game and map, then create your first package."}
            </p>
          </div>
        )}

        {!isLoading && !isError && packages.length > 0 && (
          <div className="space-y-3">
            {packages.map((pkg) => (
              <PackageRow
                key={pkg.id}
                pkg={pkg}
                game={selectedGame}
                gameSlug={selectedGame?.slug ?? ""}
                mapSlug={selectedMap?.slug ?? ""}
              />
            ))}
          </div>
        )}
      </section>

      {/* Create dialog */}
      {showCreateDialog && filterGameId && filterMapId && selectedGame && selectedMap && (
        <CreatePackageDialog
          gameId={filterGameId}
          mapId={filterMapId}
          gameSlug={selectedGame.slug}
          mapSlug={selectedMap.slug}
          side={filterSide || "any"}
          onClose={() => setShowCreateDialog(false)}
        />
      )}
    </main>
  );
}
