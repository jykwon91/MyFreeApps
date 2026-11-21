import { LoadingRegion } from "@platform/ui";

/** Shown while a lazy route's code loads. */
export default function RouteLoadingFallback() {
  return (
    <LoadingRegion label="Loading page…" className="flex-1 flex items-center justify-center">
      <div aria-hidden="true" className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </LoadingRegion>
  );
}
