import { useCallback, useEffect, useState } from "react";
import { loadFoods } from "@/games/wow-forever/food/loadFoods";
import type { FoodRecord } from "@/games/wow-forever/types/food";
import type { FoodsState } from "@/games/wow-forever/types/foodsState";

interface Loaded {
  attempt: number;
  foods: readonly FoodRecord[] | null;
}

/** Every cooked food, loaded only when a page that lists them (the Cooking guide's vendors) opens; loads again on retry. */
export function useFoods(): FoodsState {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let live = true;
    loadFoods().then(
      (foods) => live && setLoaded({ attempt, foods }),
      () => live && setLoaded({ attempt, foods: null }),
    );
    return () => {
      live = false;
    };
  }, [attempt]);

  if (!loaded) return { status: "loading" };
  if (loaded.foods) return { status: "ready", foods: loaded.foods };
  return { status: "error", retry, retrying: loaded.attempt !== attempt };
}
