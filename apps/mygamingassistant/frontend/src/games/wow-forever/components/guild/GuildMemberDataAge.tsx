import { Clock } from "lucide-react";
import { relativeTime } from "@/games/wow-forever/lib/serverStatusTime";

interface GuildMemberDataAgeProps {
  blizzard_updated_at: string | null;
}

/**
 * A muted note showing when Blizzard last saved this character's data.
 * Blizzard's profile API only snapshots a character when they log out,
 * so "Refresh now" can't pull newer data until they do.
 */
export default function GuildMemberDataAge({ blizzard_updated_at }: GuildMemberDataAgeProps) {
  if (!blizzard_updated_at) return null;
  return (
    <span
      className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground"
      title={`Blizzard's snapshot: ${new Date(blizzard_updated_at).toLocaleString()} · updates when they log out`}
    >
      <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span>Blizzard data from {relativeTime(blizzard_updated_at)} · updates when they log out</span>
    </span>
  );
}
