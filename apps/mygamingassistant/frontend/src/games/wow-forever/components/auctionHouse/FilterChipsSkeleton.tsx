interface FilterChipsSkeletonProps {
  /** What is loading, for screen readers. */
  label: string;
  count: number;
  testId: string;
}

/** Placeholder chips while a filter group's data loads. */
export default function FilterChipsSkeleton({ label, count, testId }: FilterChipsSkeletonProps) {
  return (
    <div className="flex flex-wrap gap-2" aria-busy="true" aria-label={label} data-testid={testId}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="h-11 w-20 animate-pulse rounded-full bg-muted/40" aria-hidden />
      ))}
    </div>
  );
}
