import { LoadingRegion } from "@platform/ui";

export default function DrillDownLoadingState() {
  return (
    <LoadingRegion label="Loading details…" className="p-5 space-y-3">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} aria-hidden="true" className="h-14 bg-muted/40 rounded animate-pulse" />
      ))}
    </LoadingRegion>
  );
}
