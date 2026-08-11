import Skeleton from "@/shared/components/ui/Skeleton";

export interface CalendarAgendaSkeletonProps {
  rows?: number;
}

/**
 * Skeleton for the mobile agenda list — one card per event, mirroring
 * `CalendarAgendaEvent`'s three lines so nothing shifts when data lands.
 *
 * Shared by both desktop shapes: mobile falls back to the agenda whichever
 * view the URL asks for, so its placeholder shouldn't be duplicated per view.
 */
export default function CalendarAgendaSkeleton({ rows = 4 }: CalendarAgendaSkeletonProps) {
  return (
    <ul className="space-y-3" aria-label="Loading agenda">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="space-y-2 rounded-lg border p-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-48" />
          <Skeleton className="h-3 w-24" />
        </li>
      ))}
    </ul>
  );
}
