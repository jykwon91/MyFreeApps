/**
 * `dungeon_info` — one dungeon from the dungeon pages' data, found by name,
 * nickname ("VC", "SM") or one of its bosses, with the World Map's text
 * matching (`searchText`): a name match beats a boss match, closer names first.
 */
import { levelRange } from "@/games/wow-forever/lib/ask/levelRange";
import { ASK_CARD } from "@/games/wow-forever/data/ask/askCardKinds";
import { ASK_TOOL } from "@/games/wow-forever/data/ask/askTools";
import type { AskDungeonCard } from "@/games/wow-forever/types/ask/askDungeonCard";
import type { AskDungeonMatch } from "@/games/wow-forever/types/ask/askDungeonMatch";
import type { AskQueryInput } from "@/games/wow-forever/types/ask/askQueryInput";
import type { AskToolData } from "@/games/wow-forever/types/ask/askToolData";
import type { AskToolOutcome } from "@/games/wow-forever/types/ask/askToolOutcome";
import type { Dungeon } from "@/games/wow-forever/types/dungeons/dungeon";
import { matchesAll, nameScore, normalizeText, queryTokens } from "@/games/wow-forever/worldMap/searchText";

/** Boss matches rank after every name match. */
const BOSS_MATCH_SCORE = 10;

function matchOf(dungeon: Dungeon, query: string, tokens: readonly string[]): AskDungeonMatch | null {
  const names = [dungeon.name, ...dungeon.aliases].filter((n) => matchesAll(tokens, normalizeText(n)));
  if (names.length) return { dungeon, score: Math.min(...names.map((n) => nameScore(n, query))), boss: null };
  const boss = dungeon.bosses.find((b) => matchesAll(tokens, normalizeText(b.name)));
  return boss === undefined ? null : { dungeon, score: BOSS_MATCH_SCORE + nameScore(boss.name, query), boss: boss.name };
}

export function bestAskDungeonMatch(dungeons: readonly Dungeon[], query: string): AskDungeonMatch | null {
  const tokens = queryTokens(query);
  if (!tokens.length) return null;
  const matches = dungeons.flatMap((d) => matchOf(d, query, tokens) ?? []);
  matches.sort((a, b) => a.score - b.score || a.dungeon.levelMin - b.dungeon.levelMin);
  return matches[0] ?? null;
}

function card(match: AskDungeonMatch): AskDungeonCard {
  const { dungeon } = match;
  return {
    kind: ASK_CARD.dungeon,
    slug: dungeon.slug,
    name: dungeon.name,
    levelMin: dungeon.levelMin,
    levelMax: dungeon.levelMax,
    requiredLevel: dungeon.requiredLevel,
    zones: dungeon.entrances.map((e) => e.zoneName),
    bosses: dungeon.bosses.map((b) => b.name),
    matchedBoss: match.boss,
  };
}

export async function dungeonInfoTool(input: AskQueryInput, data: AskToolData): Promise<AskToolOutcome> {
  const { dungeons } = await data.loadDungeons();
  const match = bestAskDungeonMatch(dungeons, input.query);
  if (match === null) {
    return {
      content: JSON.stringify({ result: null }),
      isError: false,
      card: { kind: ASK_CARD.noResults, tool: ASK_TOOL.dungeonInfo, query: input.query },
    };
  }
  const found = card(match);
  const result = {
    name: found.name,
    levels: levelRange(found.levelMin, found.levelMax),
    lowest_level_to_enter: found.requiredLevel,
    entrance_zones: found.zones,
    bosses: found.bosses,
    matched_boss: found.matchedBoss,
  };
  return { content: JSON.stringify(result), isError: false, card: found };
}
