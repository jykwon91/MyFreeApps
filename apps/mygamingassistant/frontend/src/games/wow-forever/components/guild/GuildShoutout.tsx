import { Heart } from "lucide-react";
import { useId } from "react";
import GuildMemberLink from "@/games/wow-forever/components/guild/GuildMemberLink";
import { GUILD_SHOUTOUT } from "@/games/wow-forever/data/guild/guildShoutout";
import { shoutoutDetail } from "@/games/wow-forever/lib/guild/guildShoutout";
import { SHOUTOUT_BADGE, SHOUTOUT_CARD } from "@/games/wow-forever/data/guild/guildStyles";
import type { GuildMember } from "@/games/wow-forever/types/guild/guildMember";

interface GuildShoutoutProps {
  members: readonly GuildMember[];
}

/** The top of the Home tab: one member's card with a heart badge. Nothing when they aren't on the roster. */
export default function GuildShoutout({ members }: GuildShoutoutProps) {
  const badgeId = useId();
  const member = members.find((m) => m.slug === GUILD_SHOUTOUT.slug);
  if (!member) return null;
  const detail = shoutoutDetail(member.level, member.class_name);
  return (
    <section aria-labelledby={badgeId} className={SHOUTOUT_CARD} data-testid="guild-shoutout">
      <span id={badgeId} className={SHOUTOUT_BADGE}>
        <Heart aria-hidden className="h-4 w-4 shrink-0 fill-current" />
        {GUILD_SHOUTOUT.badge}
      </span>
      <div className="flex flex-col">
        <GuildMemberLink member={member} size="lg" />
        {detail ? <p className="text-sm text-muted-foreground">{detail}</p> : null}
      </div>
    </section>
  );
}
