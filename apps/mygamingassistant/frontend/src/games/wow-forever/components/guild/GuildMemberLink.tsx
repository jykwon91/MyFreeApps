import clsx from "clsx";
import { Link, useLocation } from "react-router-dom";
import { CHARACTER_PAGE_PATH } from "@/games/wow-forever/data/character/characterConfig";
import { GUILD_BACK_LABEL } from "@/games/wow-forever/data/guild/guildConfig";
import { GUILD_MEMBER_NAME_SIZES } from "@/games/wow-forever/data/guild/guildMemberNameSizes";
import { CLASS_NAME_TEXT, CLASS_NAME_TEXT_ON_DARK } from "@/games/wow-forever/data/guild/guildStyles";
import { memberFullName } from "@/games/wow-forever/lib/guild/guildMembers";
import { memberClassStyle } from "@/games/wow-forever/lib/guild/memberClassStyle";
import type { GuildMemberName } from "@/games/wow-forever/types/guild/guildMemberName";
import type { GuildMemberNameSize } from "@/games/wow-forever/types/guild/guildMemberNameSize";
import type { BackLinkState } from "@/games/wow-forever/types/shared/backLinkState";

interface GuildMemberLinkProps {
  member: GuildMemberName;
  size?: GuildMemberNameSize;
  /** On the guild banner, which is dark in both themes. */
  onDark?: boolean;
  /** Layout only (alignment, wrapping): size and colour come from `size` and `onDark`. */
  className?: string;
}

/** A member's name, bold in their class colour so the eye lands on it, linking to their character page. */
export default function GuildMemberLink({ member, size = "md", onDark = false, className }: GuildMemberLinkProps) {
  const { pathname, search } = useLocation();
  const back: BackLinkState = { backTo: `${pathname}${search}`, backLabel: GUILD_BACK_LABEL };
  return (
    <Link
      to={`${CHARACTER_PAGE_PATH}/${member.slug}`}
      state={back}
      style={memberClassStyle(member.class_name)}
      className={clsx(
        "inline-flex min-h-[44px] items-center rounded font-bold tracking-tight underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        GUILD_MEMBER_NAME_SIZES[size],
        onDark ? CLASS_NAME_TEXT_ON_DARK : CLASS_NAME_TEXT,
        className,
      )}
    >
      {memberFullName(member)}
    </Link>
  );
}
