import { isMemberStale } from "@/games/wow-forever/lib/guild/guildMembers";
import { relativeTime } from "@/games/wow-forever/lib/serverStatusTime";
import type { GuildMember } from "@/games/wow-forever/types/guild/guildMember";

interface GuildMemberStaleNoteProps {
  member: GuildMember;
  rosterUpdatedAt: string | null;
}

/** "updated 3 days ago" for a member whose profile stopped refreshing with the roster. */
export default function GuildMemberStaleNote({ member, rosterUpdatedAt }: GuildMemberStaleNoteProps) {
  if (!isMemberStale(member, rosterUpdatedAt)) return null;
  return <span className="block text-xs text-muted-foreground">updated {relativeTime(member.refreshed_at)}</span>;
}
