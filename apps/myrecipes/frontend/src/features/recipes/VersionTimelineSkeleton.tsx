import { LoadingRegion, Skeleton } from "@platform/ui";
import { VERSION_COPY } from "@myrecipes/api-client/constants/versions";

/** The timeline rail while it loads: its heading and Compare button, then a few version entries. */
export default function VersionTimelineSkeleton() {
  return (
    <LoadingRegion label={VERSION_COPY.listLoading} className="bg-card border rounded-lg p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-8 w-24" />
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-md border p-3 space-y-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-3 w-24" />
        </div>
      ))}
    </LoadingRegion>
  );
}
