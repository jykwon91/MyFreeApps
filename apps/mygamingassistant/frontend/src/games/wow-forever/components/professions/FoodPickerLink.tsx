import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

/** From the Cooking route to the food picker — "which of these should I actually eat?". */
export default function FoodPickerLink() {
  return (
    <Link
      to="/wow-forever/food"
      className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline min-h-[44px]"
    >
      Not sure what to cook? Try the food picker
      <ArrowRight className="h-4 w-4" aria-hidden />
    </Link>
  );
}
