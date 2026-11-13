import { Crown } from "lucide-react";
import GuildMemberLink from "@/games/wow-forever/components/guild/GuildMemberLink";
import { CLASS_NAME_TEXT, HERO_CARD } from "@/games/wow-forever/data/guild/guildStyles";
import { memberClassStyle } from "@/games/wow-forever/lib/guild/memberClassStyle";
import type { BoardHero } from "@/games/wow-forever/types/guild/boardHero";

interface GuildHeroCardProps {
  hero: BoardHero;
}

/** One gains board's leader: a crown, what they led, "+N" in big type, their name in class colour, and who is chasing them. */
export default function GuildHeroCard({ hero }: GuildHeroCardProps) {
  const { leader } = hero;
  return (
    <li className={HERO_CARD}>
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Crown aria-hidden className="h-4 w-4 shrink-0 text-[#B8902A]" />
        {hero.board.label}
      </p>
      <p className="text-3xl font-extrabold tabular-nums">{leader.display}</p>
      <GuildMemberLink member={leader.member} className={`${CLASS_NAME_TEXT} text-base font-bold`} style={memberClassStyle(leader.member.class_name)} />
      <p className="text-sm text-muted-foreground">{hero.hint}</p>
    </li>
  );
}
