import { Skeleton } from "@platform/ui";

interface ProfessionRowsSkeletonProps {
  label: string;
  testId: string;
}

/** Stands in for the rows when the filters depend on prices that haven't loaded yet. */
export default function ProfessionRowsSkeleton({ label, testId }: ProfessionRowsSkeletonProps) {
  return (
    <div aria-busy="true" aria-label={label} className="space-y-3" data-testid={testId}>
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-20 w-full rounded-xl" />
      ))}
    </div>
  );
}
