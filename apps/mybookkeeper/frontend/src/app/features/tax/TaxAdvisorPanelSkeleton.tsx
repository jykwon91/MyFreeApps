import { Lightbulb } from "lucide-react";
import { LoadingRegion, Skeleton } from "@platform/ui";

export default function TaxAdvisorPanelSkeleton() {
  return (
    <LoadingRegion label="Loading tax advisor panel…" className="space-y-4">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Lightbulb className="h-5 w-5 animate-pulse" />
        <span>Hmm, let me review your tax data...</span>
      </div>
      <div className="border rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-5 w-14 rounded" />
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-8 w-full rounded" />
      </div>
    </LoadingRegion>
  );
}
