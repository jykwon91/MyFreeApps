import { Lock } from "lucide-react";

interface PlannerReadOnlyBannerProps {
  /** Why the groups can't be changed: the raid was cancelled, or is over. */
  message: string;
}

/** In place of the toolbar when nothing can be moved. */
export default function PlannerReadOnlyBanner({ message }: PlannerReadOnlyBannerProps) {
  return (
    <p role="status" className="flex items-center gap-2 rounded-lg border bg-muted px-3 py-2 text-sm">
      <Lock aria-hidden className="h-4 w-4 shrink-0" />
      {message}
    </p>
  );
}
