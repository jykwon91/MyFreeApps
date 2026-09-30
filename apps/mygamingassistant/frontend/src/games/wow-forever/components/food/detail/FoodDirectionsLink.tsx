import { MapPin } from "lucide-react";
import { Link } from "react-router-dom";
import { DETAIL_LINK } from "@/games/wow-forever/components/food/detail/detailStyles";
import { directionsHref } from "@/games/wow-forever/food/recipeSources";

interface FoodDirectionsLinkProps {
  spot: { zoneId: number; x: number; y: number };
  /** Who or what is there — for the screen-reader label. */
  name: string;
}

/** The World Map with directions to this spot from where you are. */
export default function FoodDirectionsLink({ spot, name }: FoodDirectionsLinkProps) {
  return (
    <Link to={directionsHref(spot)} aria-label={`Directions to ${name}`} className={DETAIL_LINK}>
      <MapPin className="h-4 w-4" aria-hidden />
      Directions
    </Link>
  );
}
