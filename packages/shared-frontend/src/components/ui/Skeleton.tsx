interface Props {
  className?: string;
  testId?: string;
}

export default function Skeleton({ className = "h-4 w-full", testId }: Props) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded bg-muted ${className}`}
      data-testid={testId}
    />
  );
}
