import { Crown } from "lucide-react";
import GuildMemberLink from "@/games/wow-forever/components/guild/GuildMemberLink";
import { HERO_CARD } from "@/games/wow-forever/data/guild/guildStyles";
import type { BoardHero } from "@/games/wow-forever/types/guild/boardHero";

interface GuildHeroCardProps {
  hero: BoardHero;
}

/** One gains board's leader: a crown, what they led, their name large in class colour, then "+N", and who is chasing them. */
export default function GuildHeroCard({ hero }: GuildHeroCardProps) {
  const { leader } = hero;
  return (
    <li className={HERO_CARD}>
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Crown aria-hidden className="h-4 w-4 shrink-0 text-[#B8902A]" />
        {hero.board.label}
      </p>
      <GuildMemberLink member={leader.member} size="lg" />
      <p className="text-2xl font-extrabold tabular-nums">{leader.display}</p>
      <p className="text-sm text-muted-foreground">{hero.hint}</p>
    </li>
  );
}
