import type { ReactNode } from "react";

interface GuildSkeletonCardProps {
  testId: string;
  children: ReactNode;
}

/** A guild section's outline while it loads: the card and its heading bar, then what goes in it. */
export default function GuildSkeletonCard({ testId, children }: GuildSkeletonCardProps) {
  return (
    <div className="space-y-3 rounded-xl border p-3 sm:p-4" data-testid={testId}>
      <div className="h-6 w-44 rounded bg-muted animate-pulse" />
      {children}
    </div>
  );
}
