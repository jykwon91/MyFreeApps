import Skeleton from "@/shared/components/ui/Skeleton";

export default function TaxDocumentsAccordionSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 2 }, (_, yearIdx) => (
        <div key={yearIdx} className="border rounded-lg overflow-hidden">
          {/* Year header */}
          <div className="px-3 py-3 flex items-center gap-3 bg-muted/50">
            <Skeleton className="h-4 w-4 rounded" />
            <Skeleton className="h-5 w-12" />
            <Skeleton className="h-5 w-24 rounded-full" />
          </div>
          {yearIdx === 0 && (
            <div className="pl-3">
              {Array.from({ length: 3 }, (_, formIdx) => (
                <div key={formIdx} className="border-t">
                  {/* Form type header */}
                  <div className="px-3 py-2.5 flex items-center gap-3">
                    <Skeleton className="h-4 w-4 rounded" />
                    <Skeleton className="h-5 w-16 rounded" />
                    <Skeleton className="h-5 w-8 rounded-full" />
                    <div className="ml-auto">
                      <Skeleton className="h-4 w-20" />
                    </div>
                  </div>
                  {formIdx === 0 && (
                    <div className="pl-3">
                      {Array.from({ length: 2 }, (_, itemIdx) => (
                        <div
                          key={itemIdx}
                          className="border-t px-3 py-2.5 flex items-center gap-3"
                        >
                          <Skeleton className="h-4 w-36" />
                          <Skeleton className="h-4 w-24" />
                          <div className="ml-auto">
                            <Skeleton className="h-4 w-20" />
                          </div>
                          <Skeleton className="h-8 w-14 rounded-md" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      {/* Checklist skeleton */}
      <div className="border rounded-lg p-4 space-y-3">
        <Skeleton className="h-5 w-48" />
        {Array.from({ length: 3 }, (_, i) => (
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
