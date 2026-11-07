export interface SkeletonProps {
  className?: string;
  testId?: string;
}

export default function Skeleton({ className = "h-4 w-full", testId }: SkeletonProps) {
  return (
    <div className={`animate-pulse rounded bg-muted ${className}`} data-testid={testId} />
  );
}
