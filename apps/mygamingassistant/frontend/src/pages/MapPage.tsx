import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Map } from "lucide-react";
import { useGetGamesQuery, useGetMapDetailQuery } from "@/store/gamesApi";

/**
 * Map detail page — lineup viewer.
 * Route: /:gameSlug/:mapSlug
 *
 * Phase 1 stub: shows map metadata (zones, sites) and a placeholder for the
 * lineup overlay canvas. Full lineup viewer comes in Phase 2.
 */
export default function MapPage() {
  const { gameSlug, mapSlug } = useParams<{ gameSlug: string; mapSlug: string }>();
  const navigate = useNavigate();

  const { data: games } = useGetGamesQuery();
  const { data: mapDetail, isLoading, isError } = useGetMapDetailQuery(
    { gameSlug: gameSlug ?? "", mapSlug: mapSlug ?? "" },
    { skip: !gameSlug || !mapSlug },
  );

  const game = games?.find((g) => g.slug === gameSlug);
  const gameTitle = game?.name ?? gameSlug ?? "";

  if (isLoading) {
    return (
      <main className="p-4 sm:p-8 space-y-6 max-w-4xl">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(`/${gameSlug}`)}
            className="p-2 rounded-md hover:bg-muted/40 transition-colors min-h-[44px]"
            aria-label="Back to maps"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="h-8 w-48 bg-muted/40 rounded animate-pulse" />
        </div>
        <div className="h-64 rounded-xl bg-muted/40 animate-pulse" />
      </main>
    );
  }

  if (isError || !mapDetail) {
    return (
      <main className="p-4 sm:p-8 space-y-6 max-w-4xl">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(`/${gameSlug}`)}
            className="p-2 rounded-md hover:bg-muted/40 transition-colors min-h-[44px]"
            aria-label="Back to maps"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-2xl font-semibold capitalize">{mapSlug}</h1>
        </div>
        <p className="text-sm text-destructive">
          Failed to load map details. Please refresh the page.
        </p>
      </main>
    );
  }

  return (
    <main className="p-4 sm:p-8 space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(`/${gameSlug}`)}
          className="p-2 rounded-md hover:bg-muted/40 transition-colors min-h-[44px]"
          aria-label={`Back to ${gameTitle} maps`}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <p className="text-xs text-muted-foreground">{gameTitle}</p>
          <h1 className="text-2xl font-semibold capitalize">{mapDetail.name}</h1>
        </div>
      </div>

      {/* Phase 1 stub: minimap placeholder + metadata */}
      <div className="rounded-xl border bg-card p-6 flex flex-col items-center justify-center gap-4 min-h-[240px]">
        {mapDetail.minimap_url ? (
          <img
            src={mapDetail.minimap_url}
            alt={`${mapDetail.name} minimap`}
            className="max-h-64 rounded-lg object-contain"
          />
        ) : (
          <>
            <Map className="h-16 w-16 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Lineup viewer coming in Phase 2.
            </p>
          </>
        )}
      </div>

      {/* Sites */}
      {mapDetail.sites.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Sites
          </h2>
          <div className="flex flex-wrap gap-2">
            {mapDetail.sites.map((site) => (
              <span
                key={site.id}
                className="px-3 py-1 text-sm rounded-full border bg-card"
              >
                {site.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Zones */}
      {mapDetail.zones.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Zones
          </h2>
          <div className="flex flex-wrap gap-2">
            {mapDetail.zones.map((zone) => (
              <span
                key={zone.id}
                className="px-3 py-1 text-sm rounded-full border bg-card"
              >
                {zone.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Utility types available on this map */}
      {mapDetail.utility_types.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Utility
          </h2>
          <div className="flex flex-wrap gap-2">
            {mapDetail.utility_types.map((ut) => (
              <span
                key={ut.id}
                className="px-3 py-1 text-sm rounded-full border bg-card capitalize"
              >
                {ut.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
