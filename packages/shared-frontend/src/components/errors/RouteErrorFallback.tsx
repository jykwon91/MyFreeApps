import { useEffect, useState } from "react";
import { isRouteErrorResponse, useRouteError } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import Button from "../ui/Button";
import NewVersionPrompt from "./NewVersionPrompt";
import {
  isChunkLoadError,
  isStaleChunkReloadScheduled,
  reloadOnceForStaleChunk,
} from "../../lib/stale-chunk";

function describeRouteError(error: unknown): string {
  if (isRouteErrorResponse(error)) return `${error.status} ${error.statusText}`;
  if (error instanceof Error) return error.message;
  return "Unknown error";
}

/**
 * Data-router `errorElement` shared by every app (see `withRouteErrorBoundary`).
 * Replaces React Router's default "Unexpected Application Error!" developer
 * screen.
 *
 * - A failed lazy chunk means the tab predates a deploy: reload once onto the
 *   new build (same guard as `installStaleChunkRecovery`, so the two can never
 *   combine into a loop) and otherwise show the "new version" prompt.
 * - Anything else gets a plain "something went wrong" with reload / home.
 */
export default function RouteErrorFallback() {
  const error = useRouteError();
  const isStaleChunk = isChunkLoadError(error);
  const [isReloading, setIsReloading] = useState<boolean>(isStaleChunkReloadScheduled);

  useEffect(() => {
    console.error("[RouteErrorFallback]", error);
    if (isStaleChunk && !isStaleChunkReloadScheduled() && reloadOnceForStaleChunk()) {
      setIsReloading(true);
    }
  }, [error, isStaleChunk]);

  if (isStaleChunk) return <NewVersionPrompt isReloading={isReloading} />;

  return (
    <div className="flex flex-1 items-center justify-center p-8 min-h-[50vh]" role="alert">
      <div className="max-w-md text-center flex flex-col items-center gap-3">
        <AlertTriangle size={40} className="text-destructive/60" aria-hidden="true" />
        <h2 className="text-lg font-semibold text-foreground">Something went wrong</h2>
        <p className="text-sm text-muted-foreground break-words">{describeRouteError(error)}</p>
        <div className="flex items-center justify-center gap-3">
          <Button variant="primary" onClick={() => window.location.reload()}>
            Reload
          </Button>
          <Button variant="secondary" onClick={() => window.location.assign("/")}>
            Go home
          </Button>
        </div>
      </div>
    </div>
  );
}
