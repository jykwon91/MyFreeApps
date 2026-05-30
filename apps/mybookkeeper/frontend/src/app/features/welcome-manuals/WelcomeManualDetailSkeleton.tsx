import Skeleton from "@/shared/components/ui/Skeleton";

/**
 * Mirror of the loaded WelcomeManualDetail layout: header card (title +
 * intro + actions), then a document of section cards. Same vertical sections
 * and rough heights so the skeleton swaps in-place without layout shift.
 */
export default function WelcomeManualDetailSkeleton() {
  const sections = [0, 1, 2];

  return (
    <div data-testid="welcome-manual-detail-skeleton" className="space-y-6">
      {/* Header card */}
      <section className="border rounded-lg p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-7 w-64" />
            <Skeleton className="h-5 w-24 rounded-full" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-10 w-16 rounded-md" />
            <Skeleton className="h-10 w-28 rounded-md" />
            <Skeleton className="h-10 w-20 rounded-md" />
          </div>
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </section>

      {/* Sections document */}
      {sections.map((i) => (
        <section key={i} className="border rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-8 w-8 rounded" />
          </div>
          <Skeleton className="h-24 w-full rounded-md" />
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            <Skeleton className="aspect-square w-full rounded-md" />
            <Skeleton className="aspect-square w-full rounded-md" />
          </div>
        </section>
      ))}
    </div>
  );
}
