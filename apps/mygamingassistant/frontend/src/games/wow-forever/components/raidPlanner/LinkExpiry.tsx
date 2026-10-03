import { cn } from "@platform/ui";
import { Clock } from "lucide-react";
import { isLinkExpiring, linkExpiryLabel } from "@/games/wow-forever/lib/raidTime";

interface LinkExpiryProps {
  /** ISO 8601. */
  expiresAt: string;
  now: number;
}

/** "Link expires in 1 h 52 m" — amber in its last ten minutes, so the leader saves before it stops working. */
export default function LinkExpiry({ expiresAt, now }: LinkExpiryProps) {
  const label = linkExpiryLabel(expiresAt, now);
  if (label === "") return null;
  return (
    <p className={cn("flex items-center gap-1.5 text-sm", toneOf(isLinkExpiring(expiresAt, now)))}>
      <Clock aria-hidden className="h-4 w-4 shrink-0" />
      <time dateTime={expiresAt}>{label}</time>
    </p>
  );
}

function toneOf(expiring: boolean): string {
  if (expiring) return "font-medium text-amber-700 dark:text-amber-400";
  return "text-muted-foreground";
}
