/**
 * LineupDetail — single-lineup direct-link page.
 * Route: /lineups/:id
 *
 * Public read: accepted lineups are visible to everyone via useGetLineupQuery.
 * Operator fallback: if the public fetch returns 404 and the user is authed,
 * useGetLineupAdminQuery is tried so the operator can deep-link to
 * pending_review / hidden lineups.
 *
 * Design knobs (URL-backed ?stand=still, ?aim=still, etc.) are handled by
 * useDesignKnobs — same as MapPage, no extra wiring needed.
 */
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useGetLineupQuery, useGetLineupAdminQuery } from "@/store/lineupsApi";
import { useIsSuperuser } from "@/hooks/useIsSuperuser";
import { useDesignKnobs } from "@/hooks/useDesignKnobs";
import GlanceBoardTile from "@/components/lineup/GlanceBoardTile";
import LineupDetailSkeleton from "@/components/lineup/LineupDetailSkeleton";
import LineupDetailBackLink from "@/components/lineup/LineupDetailBackLink";

export default function LineupDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const { isSuperuser } = useIsSuperuser();
  const { knobs } = useDesignKnobs();

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

  const isLoading = publicLoading || (is404 && isSuperuser && adminLoading);
  const lineup = publicLineup ?? adminLineup ?? null;
  const notFound = !isLoading && !lineup && (adminError || !isSuperuser);

  if (isLoading) {
    return <LineupDetailSkeleton />;
  }

  if (notFound || !lineup) {
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

  return (
    <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">
      <LineupDetailBackLink
        gameId={lineup.game_id}
        mapId={lineup.map_id}
      />
      <GlanceBoardTile
        lineup={lineup}
        knobs={knobs}
        showOperatorOverlays={isSuperuser}
      />
    </main>
  );
}
