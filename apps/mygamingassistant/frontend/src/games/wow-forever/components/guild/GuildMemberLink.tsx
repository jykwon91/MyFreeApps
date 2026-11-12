import clsx from "clsx";
import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { CHARACTER_PAGE_PATH } from "@/games/wow-forever/data/character/characterConfig";
import { memberFullName } from "@/games/wow-forever/lib/guild/guildMembers";
import type { GuildMemberName } from "@/games/wow-forever/types/guild/guildMemberName";

interface GuildMemberLinkProps {
  member: GuildMemberName;
  /** Extra classes and style (the leaderboards' class colour). */
  className?: string;
  style?: CSSProperties;
}

/** A member's name, linking to their character page. */
export default function GuildMemberLink({ member, className, style }: GuildMemberLinkProps) {
  return (
    <Link
      to={`${CHARACTER_PAGE_PATH}/${member.slug}`}
      style={style}
      className={clsx(
        "inline-flex min-h-[44px] items-center rounded font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {memberFullName(member)}
    </Link>
  );
}
