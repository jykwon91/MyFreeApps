import type { SmeltRecipe } from "@/games/wow-forever/types/crafting";

/** A smelt, with what the Forever client says it is cast next to ("Forge", "Black Forge", "Molten Foundry"). */
export type MiningSmelt = SmeltRecipe & { focus: string };
