import Skeleton from "@/shared/components/ui/Skeleton";

export default function TaxReturnSkeleton() {
  return (
    <div className="space-y-6">
      {/* Back nav + SectionHeader */}
      <div className="space-y-3">
        <Skeleton className="h-4 w-36" />
        <div className="flex items-center justify-between">
          <div className="space-y-1.5">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-28" />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-9 w-28 rounded-md" />
          </div>
        </div>
      </div>

      {/* Forms section — grid of form cards */}
      <section className="space-y-4">
        <Skeleton className="h-6 w-16" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="border rounded-lg p-5 space-y-3">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-20" />
              <div className="flex gap-2">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Validation section */}
      <section className="space-y-4">
        <Skeleton className="h-6 w-24" />
        <div className="border rounded-lg p-4 space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-5 w-5 rounded-full shrink-0" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          ))}
        </div>
      </section>

      {/* AI Tax Advisor section */}
      <section className="space-y-4">
        <Skeleton className="h-6 w-32" />
        <div className="border rounded-lg p-4 space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </section>
    </div>
  );
}
