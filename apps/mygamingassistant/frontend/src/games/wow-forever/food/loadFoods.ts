import type { FoodRecord } from "@/games/wow-forever/types/food";

let cached: Promise<readonly FoodRecord[]> | null = null;

/** Every cooked food (~85 KB), loaded once in its own chunk (a failed load is tried again next time). */
export function loadFoods(): Promise<readonly FoodRecord[]> {
  if (!cached) {
    cached = import("@/games/wow-forever/data/food/foodData").then(
      (m) => m.FOODS,
      (error: unknown) => {
        cached = null;
        throw error;
      },
    );
  }
  return cached;
}
