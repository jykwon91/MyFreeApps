import {
  GUILD_TITLE_MIN_RANKED,
  GUILD_TITLE_PROFESSION_FLOOR,
  GUILD_TITLE_SOURCE_ORDER,
  GUILD_TITLE_TIE_MIN,
  GUILD_TITLE_TIE_SHARE,
  GUILD_TITLES,
} from "@/games/wow-forever/data/guild/guildTitles";
import { LEADERBOARD_SOURCE_KIND, LEADERBOARDS } from "@/games/wow-forever/data/guild/leaderboardConfig";
import { isGainBoard, rankBoard } from "@/games/wow-forever/lib/guild/guildLeaderboards";
import type { GuildMember } from "@/games/wow-forever/types/guild/guildMember";
import type { GuildTitle } from "@/games/wow-forever/types/guild/guildTitle";
import type { GuildTitles } from "@/games/wow-forever/types/guild/guildTitles";
import type { LeaderboardBoard } from "@/games/wow-forever/types/guild/leaderboardBoard";
import type { SkippedGuildTitle } from "@/games/wow-forever/types/guild/skippedGuildTitle";

/** How many tied leaders a title can have before nobody gets it, for a board with this many members on it. */
export function titleTieLimit(rankedCount: number): number {
  return Math.max(GUILD_TITLE_TIE_MIN, Math.ceil(rankedCount * GUILD_TITLE_TIE_SHARE));
}

/** Whether the leaders' number earns a title at all: more than 0 (fewest deaths: any), a real skill on a profession. */
function leadersQualify(board: LeaderboardBoard, best: number): boolean {
  if (board.source.kind === LEADERBOARD_SOURCE_KIND.profession) return best >= GUILD_TITLE_PROFESSION_FLOOR;
  return board.ascending || best > 0;
}

/** Each board's title for its leaders (ties share it), and the titles skipped because too many (or all) tied. */
export function awardGuildTitles(members: readonly GuildMember[]): GuildTitles {
  const awarded: { title: GuildTitle; order: number }[] = [];
  const skipped: SkippedGuildTitle[] = [];
  for (const board of LEADERBOARDS) {
    const def = GUILD_TITLES[board.id];
    if (!def) continue;
    const ranked = rankBoard(members, board);
    if (ranked.length < GUILD_TITLE_MIN_RANKED) continue;
    const leaders = ranked.filter((e) => e.rank === 1);
    if (!leadersQualify(board, leaders[0].value)) continue;
    // Nobody leads when everyone on the board is tied, or when a crowd is.
    if (leaders.length === ranked.length || leaders.length > titleTieLimit(ranked.length)) {
      skipped.push({ title: def.title, earnedFor: def.earnedFor });
      continue;
    }
    awarded.push({
      title: {
        ...def, boardId: board.id, weekly: isGainBoard(board), holders: leaders.map((e) => e.member), display: leaders[0].display,
      },
      order: GUILD_TITLE_SOURCE_ORDER[board.source.kind],
    });
  }
  // A stable sort keeps the board order within each kind.
  const ordered = awarded.sort((a, b) => a.order - b.order).map((a) => a.title);
  const bySlug = new Map<string, GuildTitle[]>();
  for (const title of ordered) {
    for (const holder of title.holders) bySlug.set(holder.slug, [...(bySlug.get(holder.slug) ?? []), title]);
  }
  return { awarded: ordered, skipped, bySlug };
}
