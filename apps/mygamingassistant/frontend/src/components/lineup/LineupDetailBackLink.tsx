/**
 * LineupDetailBackLink — back navigation for the /lineups/:id page.
 *
 * Resolves game + map slugs from the lineup's FKs (game_id, map_id) so the
 * link targets /{game.slug}/{map.slug}. Falls back to the game-level page when
 * map can't be resolved, and to Home when neither can.
 */
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useGetGamesQuery, useGetMapsQuery } from "@/store/gamesApi";

interface LineupDetailBackLinkProps {
  gameId: string | null;
  mapId: string | null;
}

export default function LineupDetailBackLink({ gameId, mapId }: LineupDetailBackLinkProps) {
  const { data: games = [] } = useGetGamesQuery();
  const game = gameId ? games.find((g) => g.id === gameId) ?? null : null;
  const { data: maps = [] } = useGetMapsQuery(game?.slug ?? "", {
    skip: !game?.slug,
  });
  const map = mapId ? maps.find((m) => m.id === mapId) ?? null : null;

  if (game && map) {
    return (
      <Link
        to={`/${game.slug}/${map.slug}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to {map.name}
      </Link>
    );
  }

  if (game) {
    return (
      <Link
        to={`/${game.slug}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to maps
      </Link>
    );
  }

  return (
    <Link
      to="/"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      Home
    </Link>
  );
}
