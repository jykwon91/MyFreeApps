import { MapPin } from "lucide-react";
import { Link } from "react-router-dom";
import { DETAIL_LINK } from "@/games/wow-forever/components/food/detail/detailStyles";

/** A text link to a spot on the World Map. */
export default function CraftMapLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className={DETAIL_LINK}>
      <MapPin className="h-4 w-4" aria-hidden />
      {label}
    </Link>
  );
}
