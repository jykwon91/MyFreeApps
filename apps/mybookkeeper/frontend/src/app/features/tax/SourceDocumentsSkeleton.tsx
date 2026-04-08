import Skeleton from "@/shared/components/ui/Skeleton";

export default function SourceDocumentsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="border rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-muted border-b">
          <Skeleton className="h-5 w-40" />
        </div>
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="px-4 py-3 border-b flex items-center gap-4">
            <Skeleton className="h-5 w-20 rounded" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-8 w-16 rounded-md" />
          </div>
        ))}
      </div>
      <div className="border rounded-lg p-4 space-y-3">
        <Skeleton className="h-5 w-48" />
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-5 w-5 rounded-full shrink-0" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-5 w-20 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
