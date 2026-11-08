/** `profession_guide` — the Professions page's own route for the profession, from the player's skill. */
import { ASK_CARD } from "@/games/wow-forever/data/ask/askCardKinds";
import { ASK_LIMITS } from "@/games/wow-forever/data/ask/askLimits";
import { ASK_TOOL_NOTE } from "@/games/wow-forever/data/ask/askToolNotes";
import { PROFESSION_GROUPS } from "@/games/wow-forever/data/professions/professionPicker";
import { professionPageHref } from "@/games/wow-forever/lib/ask/askGuideLinks";
import { professionRouteRows } from "@/games/wow-forever/lib/ask/professionRouteRows";
import type { AskProfessionInput } from "@/games/wow-forever/types/ask/askProfessionInput";
import type { AskToolData } from "@/games/wow-forever/types/ask/askToolData";
import type { AskToolOutcome } from "@/games/wow-forever/types/ask/askToolOutcome";

export async function professionGuideTool(input: AskProfessionInput, data: AskToolData): Promise<AskToolOutcome> {
  const route = await data.loadProfessionRoute(input.profession);
  const label = PROFESSION_GROUPS.flatMap((g) => g.options).find((o) => o.id === input.profession)?.label ?? input.profession;
  const { rows, more, done } = professionRouteRows(route, input.skill, {
    label,
    faction: data.player.faction,
    max: ASK_LIMITS.cardRows,
  });
  const priced = route.kind === "crafting" && route.priced;

  const result = {
    profession: label,
    from_skill: input.skill ?? ASK_TOOL_NOTE.start,
    ...(done ? { note: ASK_TOOL_NOTE.pastRoute } : {}),
    steps: rows.map((r) => ({
      skill: r.skill,
      do: r.name,
      details: r.lines,
      unconfirmed_in_forever: r.provenance !== null,
    })),
    more_steps: more,
    ...(priced ? { page_works_out_cheapest_route: true } : {}),
  };
  const card: AskToolOutcome["card"] = {
    kind: ASK_CARD.profession,
    profession: input.profession,
    label,
    skill: input.skill,
    rows,
    more,
    priced,
    pageHref: professionPageHref(input.profession, input.skill),
  };
  return { content: JSON.stringify(result), isError: false, card };
}
