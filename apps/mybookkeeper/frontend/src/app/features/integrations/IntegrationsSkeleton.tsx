import Skeleton from "@/shared/components/ui/Skeleton";

export default function IntegrationsSkeleton() {
  return (
    <div className="space-y-6">
      {/* Bank Accounts section */}
      <section className="border rounded-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-56" />
          </div>
          <Skeleton className="h-9 w-32 rounded-md" />
        </div>
      </section>

      {/* Gmail section */}
      <section className="border rounded-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="h-9 w-32 rounded-md" />
        </div>
        {/* Label filter sub-section */}
        <div className="pt-4 border-t space-y-2">
          <Skeleton className="h-3 w-40" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-48 rounded-md" />
            <Skeleton className="h-8 w-16 rounded-md" />
          </div>
        </div>
      </section>
    </div>
  );
}
