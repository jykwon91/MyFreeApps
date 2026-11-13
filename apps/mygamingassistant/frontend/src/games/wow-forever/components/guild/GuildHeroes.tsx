import { Crown } from "lucide-react";
import { useId, useMemo } from "react";
import GuildHeroCard from "@/games/wow-forever/components/guild/GuildHeroCard";
import { HEROES_COPY } from "@/games/wow-forever/data/guild/guildHallCopy";
import { HALL_HEADING, HALL_SECTION, HERO_STRIP } from "@/games/wow-forever/data/guild/guildStyles";
import { weeklyHeroes } from "@/games/wow-forever/lib/guild/guildHeroes";
import type { GuildMember } from "@/games/wow-forever/types/guild/guildMember";

interface GuildHeroesProps {
  members: readonly GuildMember[];
  /** The gains window (the guild response's `gains_window_days`): a rolling window, not a weekly reset. */
  gainsWindowDays: number;
}

/** This week's heroes: the leader of each gains board, in a strip that snaps sideways on a phone and a grid on wide screens. */
export default function GuildHeroes({ members, gainsWindowDays }: GuildHeroesProps) {
  const headingId = useId();
  const heroes = useMemo(() => weeklyHeroes(members), [members]);
  return (
    <section aria-labelledby={headingId} className={HALL_SECTION}>
      <div>
        <h2 id={headingId} className={HALL_HEADING}>
          <Crown aria-hidden className="h-5 w-5 text-[#B8902A]" />
          {HEROES_COPY.heading}
        </h2>
        <p className="text-sm text-muted-foreground">{HEROES_COPY.window(gainsWindowDays)}</p>
      </div>
      {heroes.length === 0 ? (
        <p className="text-sm">{HEROES_COPY.empty}</p>
      ) : (
        <ul className={HERO_STRIP} aria-label={HEROES_COPY.listLabel}>
          {heroes.map((hero) => (
            <GuildHeroCard key={hero.board.id} hero={hero} />
          ))}
        </ul>
      )}
    </section>
  );
}
