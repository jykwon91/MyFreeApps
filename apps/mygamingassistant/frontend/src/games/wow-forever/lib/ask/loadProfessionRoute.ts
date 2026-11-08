/**
 * A profession's whole route for the "Ask" chat, loaded the first time it's
 * asked about: a crafting guide's route joined to its recipe data (the same
 * `resolveRoute` its page uses), or a hand-written guide's steps.
 */
import { resolveRoute } from "@/games/wow-forever/crafting/craftRoute";
import { loadCraftingData } from "@/games/wow-forever/crafting/loadCraftingData";
import type { GuideProfession } from "@/games/wow-forever/data/professions/professionPicker";
import { isCraftingProfession } from "@/games/wow-forever/lib/guideProfession";
import type { AskProfessionRoute } from "@/games/wow-forever/types/ask/askProfessionRoute";

export async function loadProfessionRoute(profession: GuideProfession): Promise<AskProfessionRoute> {
  if (isCraftingProfession(profession)) {
    const [{ CRAFTING_ROUTES }, { CRAFTING_FEATURES }, data] = await Promise.all([
      import("@/games/wow-forever/data/professions/crafting/craftingRoutes"),
      import("@/games/wow-forever/data/professions/crafting/craftingFeatures"),
      loadCraftingData(profession),
    ]);
    return {
      kind: "crafting",
      entries: resolveRoute(CRAFTING_ROUTES[profession], data.recipes, data.trainerSkills),
      priced: CRAFTING_FEATURES[profession].priced,
    };
  }
  const { GUIDE_ROUTES } = await import("@/games/wow-forever/data/professions/guideRoutes");
  return { kind: "guide", steps: GUIDE_ROUTES[profession] };
}
