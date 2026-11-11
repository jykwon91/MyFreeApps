import { Skeleton } from "@platform/ui";

const SKELETON_ROWS = [0, 1, 2] as const;

/** Placeholder rows shaped like the document list while it, or a new filter of it, loads. */
export default function DocumentListSkeleton() {
  return (
    <div className="space-y-2">
      {SKELETON_ROWS.map((row) => (
        <Skeleton key={row} className="h-16 w-full rounded-lg" />
      ))}
    </div>
  );
}
