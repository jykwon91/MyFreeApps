import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import { characterClassId } from "@/games/wow-forever/lib/character/characterClassId";
import { resolveSpec } from "@/games/wow-forever/lib/guild/memberSpec";
import type { GuildMember } from "@/games/wow-forever/types/guild/guildMember";

interface GuildMemberSpecProps {
  member: GuildMember;
  /** Text shown when the spec is unknown (null/empty talents, unknown class). */
  emptyText?: string;
  className?: string;
}

/** The member's dominant spec name with its tree icon (e.g. "Affliction" with the Affliction icon). */
export default function GuildMemberSpec({ member, emptyText, className }: GuildMemberSpecProps) {
  const classId = member.class_name ? characterClassId(member.class_name) : undefined;
  const spec = resolveSpec(classId, member.talents);
  if (!spec) return emptyText ? <span className="text-muted-foreground">{emptyText}</span> : null;
  return (
    <span className={className} data-testid="guild-member-spec">
      <GameIcon icon={spec.icon} size={16} alt="" />
      {" "}
      {spec.name}
    </span>
  );
}
