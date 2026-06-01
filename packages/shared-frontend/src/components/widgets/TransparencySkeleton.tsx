import Card from "../ui/Card";
import Skeleton from "../ui/Skeleton";

/** Loading placeholder that mirrors the TransparencyWidget layout to avoid layout shift. */
export default function TransparencySkeleton() {
  return (
    <Card>
      <div className="space-y-4">
        <Skeleton className="h-5 w-48" />
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-16" />
        </div>
        <Skeleton className="h-3 w-full rounded-full" />
        <Skeleton className="h-4 w-40" />
      </div>
    </Card>
  );
}
