import { Card, LoadingRegion, Skeleton } from "@platform/ui";

/** The list's loading state: three cards in the list's column, like the rows that replace them. */
export default function CustomersListSkeleton() {
  return (
    <LoadingRegion label="Loading customers list…" className="space-y-3">
      {[0, 1, 2].map((i) => (
        <Card key={i}>
          <Skeleton className="h-4 w-1/3 mb-2" />
          <Skeleton className="h-3 w-1/2" />
        </Card>
      ))}
    </LoadingRegion>
  );
}
