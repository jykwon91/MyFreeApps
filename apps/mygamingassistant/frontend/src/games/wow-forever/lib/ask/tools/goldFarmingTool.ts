/** `gold_farming` — the Making gold page's own farm picker (`farmsFor`) and top tips for the level (`tipsForLevel`). */
import { ASK_CARD } from "@/games/wow-forever/data/ask/askCardKinds";
import { ASK_COPY } from "@/games/wow-forever/data/ask/askCopy";
import { ASK_TOOL } from "@/games/wow-forever/data/ask/askTools";
import { ASK_TOOL_NOTE } from "@/games/wow-forever/data/ask/askToolNotes";
import { tipsForLevel } from "@/games/wow-forever/data/gold/goldTips";
import { clothPerHour, farmsFor, formatMoney, goldPerHour, levelLabel, type GoldFarm } from "@/games/wow-forever/gold/goldFarms";
import { goldFarmsHref } from "@/games/wow-forever/lib/ask/askGuideLinks";
import { askLevel, levelNotSet, levelSource } from "@/games/wow-forever/lib/ask/askLevel";
import type { AskGoldInput } from "@/games/wow-forever/types/ask/askGoldInput";
import type { AskSpotRow } from "@/games/wow-forever/types/ask/askSpotRow";
import type { AskToolData } from "@/games/wow-forever/types/ask/askToolData";
import type { AskToolOutcome } from "@/games/wow-forever/types/ask/askToolOutcome";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";

function place(farm: GoldFarm): string {
  return farm.subzone ? `${farm.subzone}, ${farm.zone}` : farm.zone;
}

function cloth(farm: GoldFarm): string | null {
  const perHour = Math.round(clothPerHour(farm));
  return perHour > 0 ? `${perHour} ${farm.cloth}` : null;
}

function spotRow(farm: GoldFarm, n: number, skinning: boolean): AskSpotRow {
  const perHour = cloth(farm);
  return {
    id: String(farm.npcId),
    n,
    name: farm.name,
    detail: `${levelLabel(farm)} ${farm.type} · ${place(farm)}`,
    extra: [ASK_COPY.goldPerHour(formatMoney(goldPerHour(farm, skinning))), perHour ? ASK_COPY.clothPerHour(perHour) : null]
      .filter((line): line is string => line !== null)
      .join(" · "),
    zoneId: farm.zoneId,
    zoneName: farm.zone,
    x: farm.x,
    y: farm.y,
    provenance: { provenance: PROVENANCE.classic },
    mapHref: null,
  };
}

export async function goldFarmingTool(input: AskGoldInput, data: AskToolData): Promise<AskToolOutcome> {
  const level = askLevel(input.level, data.player);
  if (level === null) return levelNotSet();
  const farms = farmsFor(await data.loadGoldFarms(), level.level, { skinning: input.skinning, sort: input.sort });
  const tips = tipsForLevel(level.level).top;

  const result = {
    level: level.level,
    level_source: levelSource(level),
    gold_an_hour_is: ASK_TOOL_NOTE.vendorPrices,
    tips: tips.map((t) => t.title),
    spots: farms.map((f, i) => ({
      n: i + 1,
      mob: f.name,
      level: levelLabel(f),
      type: f.type,
      where: place(f),
      gold_an_hour: formatMoney(goldPerHour(f, input.skinning)),
      cloth_an_hour: cloth(f),
      skin: f.skin || null,
    })),
  };
  const card: AskToolOutcome["card"] = farms.length
    ? {
        kind: ASK_CARD.gold,
        level: level.level,
        tips: tips.map((t) => ({ title: t.title, detail: t.detail })),
        rows: farms.map((f, i) => spotRow(f, i + 1, input.skinning)),
        pageHref: goldFarmsHref(),
      }
    : { kind: ASK_CARD.noResults, tool: ASK_TOOL.goldFarming, query: ASK_COPY.levelQuery(level.level) };
  return { content: JSON.stringify(result), isError: false, card };
}
