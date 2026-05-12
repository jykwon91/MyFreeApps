import { Link } from "react-router-dom";
import { Gamepad2 } from "lucide-react";
import { useGetGamesQuery } from "@/store/gamesApi";

/**
 * Landing page — shows all available games as a selection grid.
 * Phase 1: populated from fixture data (Valorant + CS2).
 */
export default function GameGrid() {
  const { data: games, isLoading, isError } = useGetGamesQuery();

  if (isLoading) {
    return (
      <main className="p-4 sm:p-8 space-y-6 max-w-4xl">
        <h1 className="text-2xl font-semibold">Games</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-32 rounded-xl bg-muted/40 animate-pulse"
              aria-hidden
            />
          ))}
        </div>
      </main>
    );
  }

  if (isError || !games) {
    return (
      <main className="p-4 sm:p-8 space-y-6 max-w-4xl">
        <h1 className="text-2xl font-semibold">Games</h1>
        <p className="text-sm text-destructive">
          Failed to load games. Please refresh the page.
        </p>
      </main>
    );
  }

  if (games.length === 0) {
    return (
      <main className="p-4 sm:p-8 space-y-6 max-w-4xl">
        <h1 className="text-2xl font-semibold">Games</h1>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Gamepad2 className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No games loaded yet.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Run <code className="font-mono">python -m app.cli load-fixtures</code> to seed game data.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="p-4 sm:p-8 space-y-6 max-w-4xl">
      <h1 className="text-2xl font-semibold">Games</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {games.map((game) => (
          <Link
            key={game.id}
            to={`/${game.slug}`}
            className="group flex flex-col items-center justify-center h-32 rounded-xl border bg-card hover:bg-muted/40 transition-colors p-6 gap-3"
          >
            <Gamepad2 className="h-8 w-8 text-primary group-hover:scale-110 transition-transform" />
            <span className="text-base font-semibold">{game.name}</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
