import { LoadingRegion, Skeleton } from "@platform/ui";

export default function TenantPaymentsSkeleton() {
  return (
    <LoadingRegion label="Loading tenant payments…" className="space-y-2">
      <Skeleton className="h-5 w-32" />
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex justify-between">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </LoadingRegion>
  );
}
