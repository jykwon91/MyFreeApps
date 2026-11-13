import GuildDuelSide from "@/games/wow-forever/components/guild/GuildDuelSide";
import { HOT_RACES_COPY } from "@/games/wow-forever/data/guild/guildHallCopy";
import { unitCount } from "@/games/wow-forever/lib/guild/guildChase";
import type { HotRace } from "@/games/wow-forever/types/guild/hotRace";

interface GuildDuelCardProps {
  race: HotRace;
  /** The board's awarded title, or null when nobody holds one (too few ranked, or a big tie). */
  stake: string | null;
}

/** A close race as a duel: the board (and the title at stake), both names with their numbers around a "VS", and how far apart they are. */
export default function GuildDuelCard({ race, stake }: GuildDuelCardProps) {
  return (
    <li className="space-y-2 rounded-xl border-2 border-red-500/40 bg-gradient-to-b from-red-500/10 to-card p-3">
      <p className="text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {race.board.label}
        {stake ? ` · ${stake}` : ""}
      </p>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
        <GuildDuelSide entry={race.leader} />
        <span aria-hidden className="text-lg font-black italic text-red-600 dark:text-red-400">
          {HOT_RACES_COPY.versus}
        </span>
        <GuildDuelSide entry={race.runnerUp} />
      </div>
      <p className="text-center text-xs text-muted-foreground">{HOT_RACES_COPY.apart(unitCount(race.board.id, race.gap))}</p>
    </li>
  );
}
