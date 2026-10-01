import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Map } from "lucide-react";
import LoadErrorRetry from "@/components/game/LoadErrorRetry";
import MapGridCard from "@/components/map/MapGridCard";
import { useGetGamesQuery, useGetMapsQuery } from "@/store/gamesApi";

/**
 * Map selection grid for a specific game.
 * Route: /:gameSlug
 * Phase 1: populated from fixture data.
 */
export default function MapGrid() {
  const { gameSlug } = useParams<{ gameSlug: string }>();
  const navigate = useNavigate();

  const { data: games } = useGetGamesQuery();
  const { data: maps, isLoading, isError, isFetching, refetch } = useGetMapsQuery(gameSlug ?? "", {
    skip: !gameSlug,
  });

  const game = games?.find((g) => g.slug === gameSlug);
  const gameTitle = game?.name ?? gameSlug ?? "Unknown game";

  if (isLoading) {
    return (
      <main className="p-4 sm:p-8 space-y-6 max-w-4xl">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="p-2 rounded-md hover:bg-muted/40 transition-colors min-h-[44px]"
            aria-label="Back to games"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-2xl font-semibold">{gameTitle}</h1>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-24 rounded-xl bg-muted/40 animate-pulse"
              aria-hidden
            />
          ))}
        </div>
      </main>
    );
  }

  if (isError || !maps) {
    return (
      <main className="p-4 sm:p-8 space-y-6 max-w-4xl">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="p-2 rounded-md hover:bg-muted/40 transition-colors min-h-[44px]"
            aria-label="Back to games"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-2xl font-semibold">{gameTitle}</h1>
        </div>
        <LoadErrorRetry message="Couldn't load the maps." retrying={isFetching} onRetry={refetch} />
      </main>
    );
  }

  if (maps.length === 0) {
    return (
      <main className="p-4 sm:p-8 space-y-6 max-w-4xl">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="p-2 rounded-md hover:bg-muted/40 transition-colors min-h-[44px]"
            aria-label="Back to games"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-2xl font-semibold">{gameTitle}</h1>
        </div>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Map className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No maps available for this game.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="p-4 sm:p-8 space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="p-2 rounded-md hover:bg-muted/40 transition-colors min-h-[44px]"
          aria-label="Back to games"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-2xl font-semibold">{gameTitle}</h1>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {maps.map((map) => (
          <MapGridCard key={map.id} map={map} gameSlug={gameSlug ?? ""} />
        ))}
      </div>
    </main>
  );
}
