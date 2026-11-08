/** `find_rares` — the Rares list's own level fit (`fitsLevel`), nearest the player's zone first (`rankRares`). */
import { ASK_CARD } from "@/games/wow-forever/data/ask/askCardKinds";
import { ASK_COPY } from "@/games/wow-forever/data/ask/askCopy";
import { ASK_LIMITS } from "@/games/wow-forever/data/ask/askLimits";
import { ASK_TOOL } from "@/games/wow-forever/data/ask/askTools";
import { ASK_TOOL_NOTE } from "@/games/wow-forever/data/ask/askToolNotes";
import { RARE_CLASSIFICATION_LABEL } from "@/games/wow-forever/data/rares/raresConfig";
import { raresPageHref } from "@/games/wow-forever/lib/ask/askGuideLinks";
import { askLevel, levelNotSet, levelSource } from "@/games/wow-forever/lib/ask/askLevel";
import { rankRares } from "@/games/wow-forever/lib/ask/rankRares";
import { originFromMessage, savedOrigin } from "@/games/wow-forever/lib/ask/resolveAskOrigin";
import { questProvenance } from "@/games/wow-forever/lib/provenance/questProvenance";
import { rareMapHref } from "@/games/wow-forever/lib/rares/rareMapHref";
import { rareLevelText, spawnPlaceText } from "@/games/wow-forever/lib/rares/rareText";
import type { AskRankedRare } from "@/games/wow-forever/types/ask/askRankedRare";
import type { AskRaresInput } from "@/games/wow-forever/types/ask/askRaresInput";
import type { AskSpotRow } from "@/games/wow-forever/types/ask/askSpotRow";
import type { AskToolData } from "@/games/wow-forever/types/ask/askToolData";
import type { AskToolOutcome } from "@/games/wow-forever/types/ask/askToolOutcome";

/** Drops on a row and in the result, most likely first. */
const DROPS_SHOWN = 3;

function dropsText({ rare }: AskRankedRare): string[] {
  return rare.drops.slice(0, DROPS_SHOWN).map((d) => `${d.name} (${d.chance}%)`);
}

function spotRow(ranked: AskRankedRare, n: number): AskSpotRow {
  const { rare, spawn } = ranked;
  const kind = RARE_CLASSIFICATION_LABEL[rare.classification];
  const level = rareLevelText(rare);
  const drops = dropsText(ranked);
  return {
    id: String(rare.id),
    n,
    name: rare.name,
    detail: [level ? `${level} ${kind}` : kind, spawnPlaceText(spawn)].join(" · "),
    extra: drops.length ? ASK_COPY.drops(drops.join(", ")) : null,
    zoneId: spawn.zoneId,
    zoneName: spawn.zoneName,
    x: spawn.x,
    y: spawn.y,
    provenance: questProvenance(rare.seenOn),
    mapHref: rareMapHref(rare),
  };
}

export async function findRaresTool(input: AskRaresInput, data: AskToolData): Promise<AskToolOutcome> {
  const level = askLevel(input.level, data.player);
  if (level === null) return levelNotSet();
  const { rares } = await data.loadRares();
  const named = input.zone === null ? null : originFromMessage(input.zone, data.places);
  // A place the map doesn't know is never swapped for the saved one.
  const origin = input.zone === null ? savedOrigin(data.player, data.world) : named;
  const near = origin === null ? null : (data.world.zoneById.get(origin.zoneId) ?? null);

  const ranked = rankRares(rares, level.level, near, data.world);
  const shown = ranked.slice(0, Math.min(input.limit, ASK_LIMITS.cardRows));
  const rows = shown.map((r, i) => spotRow(r, i + 1));
  const inZone = ranked.filter((r) => r.inZone).length;

  const result = {
    level: level.level,
    level_source: levelSource(level),
    near: origin === null ? null : { place: origin.label, source: origin.fromMessage ? ASK_TOOL_NOTE.fromMessage : ASK_TOOL_NOTE.savedLocation },
    ...(input.zone !== null && named === null ? { unknown_place: input.zone } : {}),
    results: shown.map((r, i) => ({
      n: i + 1,
      name: r.rare.name,
      kind: RARE_CLASSIFICATION_LABEL[r.rare.classification],
      level: rareLevelText(r.rare),
      where: spawnPlaceText(r.spawn),
      seen_in_forever: r.rare.seenOn !== null,
      drops: dropsText(r),
    })),
    total: ranked.length,
    in_zone: inZone,
  };
  const card: AskToolOutcome["card"] = rows.length
    ? {
        kind: ASK_CARD.rares,
        level: level.level,
        origin,
        rows,
        total: ranked.length,
        pageHref: raresPageHref(level.level, inZone > 0 && near !== null ? near.id : null),
      }
    : { kind: ASK_CARD.noResults, tool: ASK_TOOL.findRares, query: ASK_COPY.levelQuery(level.level) };
  return { content: JSON.stringify(result), isError: false, card };
}
