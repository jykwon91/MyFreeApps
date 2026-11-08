import { CLASS_RACES_SKELETON_COUNT } from "@/games/wow-forever/data/classes/classesConfig";

/**
 * Skeleton for a class page while the races data loads.
 * Mirrors the loaded layout: header with icon + badges, races section,
 * proficiencies section, and navigation links.
 */
export default function ClassPageSkeleton() {
  return (
    <div className="space-y-6" aria-hidden data-testid="class-page-skeleton">
      {/* Header: icon + badges */}
      <div className="flex items-center gap-4">
        <div className="shrink-0 rounded border bg-muted" style={{ width: 56, height: 56 }} />
        <div className="space-y-2">
          <div className="h-5 w-32 rounded bg-muted animate-pulse" />
          <div className="flex gap-2">
            <div className="h-4 w-16 rounded-full bg-muted animate-pulse" />
            <div className="h-4 w-16 rounded-full bg-muted animate-pulse" />
          </div>
        </div>
      </div>
      {/* Races section */}
      <div className="space-y-3">
        <div className="h-4 w-24 rounded bg-muted animate-pulse" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: CLASS_RACES_SKELETON_COUNT }, (_, i) => (
            <div key={i} className="h-8 w-20 rounded-full border bg-muted animate-pulse" />
          ))}
        </div>
      </div>
      {/* Proficiencies */}
      <div className="space-y-3">
        <div className="h-4 w-20 rounded bg-muted animate-pulse" />
        <div className="space-y-1.5">
          <div className="h-3 w-48 rounded bg-muted animate-pulse" />
          <div className="h-3 w-56 rounded bg-muted animate-pulse" />
        </div>
      </div>
      {/* Links */}
      <div className="space-y-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-10 w-48 rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
    </div>
  );
}
