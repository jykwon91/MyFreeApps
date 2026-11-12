import { Link } from "react-router-dom";
import { CHARACTER_PAGE_PATH } from "@/games/wow-forever/data/character/characterConfig";
import { memberFullName } from "@/games/wow-forever/lib/guild/guildMembers";
import type { GuildMember } from "@/games/wow-forever/types/guild/guildMember";

/** A member's name, linking to their character page. */
export default function GuildMemberLink({ member }: { member: GuildMember }) {
  return (
    <Link
      to={`${CHARACTER_PAGE_PATH}/${member.slug}`}
      className="inline-flex min-h-[44px] items-center rounded font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {memberFullName(member)}
    </Link>
  );
}
