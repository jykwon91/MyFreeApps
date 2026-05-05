import { Skeleton } from "@platform/ui";

export default function LoadingState() {
  return (
    <div className="space-y-3 py-4">
      <Skeleton className="h-4 w-1/4" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-5/6" />
      <Skeleton className="h-3 w-4/5" />
    </div>
  );
}
