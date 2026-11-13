import GuildMemberLink from "@/games/wow-forever/components/guild/GuildMemberLink";
import type { LeaderboardEntry } from "@/games/wow-forever/types/guild/leaderboardEntry";

interface GuildDuelSideProps {
  entry: LeaderboardEntry;
}

/** One duellist: their name in class colour over their number. */
export default function GuildDuelSide({ entry }: GuildDuelSideProps) {
  return (
    <div className="flex min-w-0 flex-col items-center">
      <GuildMemberLink member={entry.member} className="justify-center break-words text-center" />
      <span className="text-xl font-extrabold tabular-nums">{entry.display}</span>
    </div>
  );
}
