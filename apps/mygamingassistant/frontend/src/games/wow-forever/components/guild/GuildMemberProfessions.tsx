import clsx from "clsx";
import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import type { GuideProfession } from "@/games/wow-forever/data/professions/professionPicker";
import { professionIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import { memberProfessions } from "@/games/wow-forever/lib/guild/guildMemberProfessions";
import type { GuildMember } from "@/games/wow-forever/types/guild/guildMember";

interface GuildMemberProfessionsProps {
  member: GuildMember;
  /** The Profession filter, listed first; "" for none. */
  first: GuideProfession | "";
  /** Shown when the member has no stored professions; omit to show nothing. */
  emptyText?: string;
  className?: string;
}

/** The member's professions, each with its icon, skill and rank: "Tailoring 148 / 225 Expert". */
export default function GuildMemberProfessions({ member, first, emptyText, className }: GuildMemberProfessionsProps) {
  const professions = memberProfessions(member, first);
  if (professions.length === 0) return emptyText ? <span className="text-muted-foreground">{emptyText}</span> : null;
  return (
    <div className={clsx("flex flex-wrap gap-x-3 gap-y-1", className)} data-testid="guild-member-professions">
      {professions.map((p) => (
        <span key={p.profession} className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <GameIcon icon={professionIcon(p.profession)} size={16} alt="" />
          <span>{p.label}</span>
          <span className="tabular-nums">{p.skill}</span>
          {p.rank ? <span className="text-xs text-muted-foreground">{p.rank}</span> : null}
        </span>
      ))}
    </div>
  );
}
