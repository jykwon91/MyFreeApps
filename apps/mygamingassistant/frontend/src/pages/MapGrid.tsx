import { Link, useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Map } from "lucide-react";
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
  const { data: maps, isLoading, isError } = useGetMapsQuery(gameSlug ?? "", {
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
        <p className="text-sm text-destructive">
          Failed to load maps. Please refresh the page.
        </p>
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
          <Link
            key={map.id}
            to={`/${gameSlug}/${map.slug}`}
            className="group flex flex-col items-center justify-center h-24 rounded-xl border bg-card hover:bg-muted/40 transition-colors p-4 gap-2"
          >
            {map.minimap_url ? (
              <img
                src={map.minimap_url}
                alt={map.name}
                className="h-10 w-10 rounded object-cover group-hover:scale-105 transition-transform"
              />
            ) : (
              <Map className="h-8 w-8 text-muted-foreground group-hover:text-primary transition-colors" />
            )}
            <span className="text-sm font-medium capitalize">{map.name}</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
