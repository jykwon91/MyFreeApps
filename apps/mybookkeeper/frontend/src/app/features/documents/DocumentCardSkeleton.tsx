import Skeleton from "@/shared/components/ui/Skeleton";

// Mirrors one phone card in DocumentTable: name + source, status · type · age, then the row actions.
interface DocumentCardSkeletonProps {
  canWrite: boolean;
}

export default function DocumentCardSkeleton({ canWrite }: DocumentCardSkeletonProps) {
  return (
    <div className="p-4" data-testid="document-card-skeleton">
      <div className="flex justify-between items-start gap-2">
        <Skeleton className="h-4 w-40 max-w-full" />
        <Skeleton className="h-5 w-14 shrink-0" />
      </div>
      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
        <Skeleton className="h-5 w-20 rounded-full" />
        <Skeleton className="h-3 w-14" />
        <Skeleton className="h-3 w-16 ml-auto" />
      </div>
      {canWrite ? (
        <div className="mt-2 flex justify-end gap-1 border-t pt-2" data-testid="document-card-skeleton-actions">
          <Skeleton className="h-11 w-11 rounded-md" />
          <Skeleton className="h-11 w-11 rounded-md" />
        </div>
      ) : null}
    </div>
  );
}
