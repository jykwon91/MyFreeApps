/**
 * LineupDetail — single-lineup direct-link route (/lineups/:id).
 *
 * No longer a standalone page: a direct lineup link REDIRECTS into the map
 * board for that lineup's game+map, focused on the lineup, so it lands exactly
 * where an in-app pin/row click does — "the same page as every other lineup,
 * just expanded", not a separate surface.
 *
 *   /lineups/<id>  →  /<game.slug>/<map.slug>?lineup=<id>
 *
 * The board reads ?lineup=<id> to scroll the matching row into view + expand
 * its storyboard. For the operator (superuser) we also set &edit=<id>, which
 * opens the pin editor in the board's sidebar — the pin editor only exists on
 * the board, so a detail page could never host it. Public viewers are ignored
 * for ?edit by the board's own superuser gate, so appending it is harmless.
 *
 * Read model: public GET for accepted lineups; operator admin fallback for
 * pending_review / hidden (same two-query shape the standalone page used). The
 * board route is keyed by slugs but the lineup carries FKs (game_id, map_id),
 * so resolve slugs via the games + maps queries — the same lookup the old
 * back-link used — then Navigate. While the lineup or its slugs are still
 * resolving, show the skeleton; if the FKs can't be resolved to slugs, degrade
 * to the game page or Home rather than dead-ending.
 */
import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useGetLineupQuery, useGetLineupAdminQuery } from "@/store/lineupsApi";
import { useGetGamesQuery, useGetMapsQuery } from "@/store/gamesApi";
import { useIsSuperuser } from "@/hooks/useIsSuperuser";
import LineupDetailSkeleton from "@/components/lineup/LineupDetailSkeleton";

export default function LineupDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const { isSuperuser } = useIsSuperuser();

  const {
    data: publicLineup,
    isLoading: publicLoading,
    isError: publicError,
  } = useGetLineupQuery(id, { skip: !id });

  const is404 = publicError && !publicLoading;

  const {
    data: adminLineup,
    isLoading: adminLoading,
    isError: adminError,
  } = useGetLineupAdminQuery(id, {
    skip: !id || !is404 || !isSuperuser,
  });

  const lineup = publicLineup ?? adminLineup ?? null;
  const lineupLoading = publicLoading || (is404 && isSuperuser && adminLoading);
  const notFound = !lineupLoading && !lineup && (adminError || !isSuperuser);

  // Resolve the board route's slugs from the lineup's FKs. The maps query is
  // keyed by the game slug, so it waits for the game to resolve first.
  const { data: games = [], isLoading: gamesLoading } = useGetGamesQuery();
  const game = lineup?.game_id
    ? games.find((g) => g.id === lineup.game_id) ?? null
    : null;
  const { data: maps = [], isLoading: mapsLoading } = useGetMapsQuery(
    game?.slug ?? "",
    { skip: !game?.slug },
  );
  const map = lineup?.map_id
    ? maps.find((m) => m.id === lineup.map_id) ?? null
    : null;

  if (notFound) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Home
        </Link>
        <p className="text-sm text-muted-foreground">Lineup not found.</p>
      </main>
    );
  }

  // Still fetching the lineup itself.
  if (lineupLoading || !lineup) {
    return <LineupDetailSkeleton />;
  }

  // Lineup resolved — wait for the slug lookups before deciding where to go, so
  // an in-flight games/maps fetch doesn't trigger a premature fallback.
  if (gamesLoading || (game && mapsLoading)) {
    return <LineupDetailSkeleton />;
  }

  // Both slugs resolved → into the board, focused on this lineup.
  if (game && map) {
    const params = new URLSearchParams({ lineup: id });
    if (isSuperuser) params.set("edit", id);
    return (
      <Navigate to={`/${game.slug}/${map.slug}?${params.toString()}`} replace />
    );
  }

  // FKs couldn't be resolved to slugs — degrade gracefully (mirrors the old
  // back-link's fallbacks) rather than dead-ending on this route.
  if (game) {
    return <Navigate to={`/${game.slug}`} replace />;
  }
  return <Navigate to="/" replace />;
}
