interface CharacterCollapsedSkeletonProps {
  testId: string;
}

/** A closed collapsible section's shape while the sheet loads: one header row (44px button + padding). */
export default function CharacterCollapsedSkeleton({ testId }: CharacterCollapsedSkeletonProps) {
  return <div className="min-h-[52px] rounded-xl bg-muted/40 animate-pulse" aria-hidden data-testid={testId} />;
}
