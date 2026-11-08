import type { FoodRecord } from "@/games/wow-forever/types/food";

/** Every cooked food while it loads. */
export type FoodsState =
  | { status: "loading" }
  | { status: "error"; retry: () => void; retrying: boolean }
  | { status: "ready"; foods: readonly FoodRecord[] };
