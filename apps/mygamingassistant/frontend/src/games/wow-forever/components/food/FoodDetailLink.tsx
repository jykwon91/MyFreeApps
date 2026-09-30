import { ChevronRight } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import type { FoodRecord } from "@/games/wow-forever/types/food";

/** The food's name, linking to its detail page — carrying the picker's question so Back returns to it. */
export default function FoodDetailLink({ food }: { food: FoodRecord }) {
  const { search } = useLocation();
  return (
    <Link
      to={`/wow-forever/food/${food.id}${search}`}
      className="inline-flex items-center gap-0.5 text-primary underline-offset-2 hover:underline min-h-[44px] sm:min-h-0"
    >
      {food.name}
      <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
    </Link>
  );
}
