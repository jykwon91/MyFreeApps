import { MapPin } from "lucide-react";
import { Link } from "react-router-dom";
import type { TrainerNpc } from "@/games/wow-forever/data/professions/professionTypes";

/** "Show on map": the World Map opened on this trainer, with directions from where you are. */
export default function TrainerMapLink({ npc }: { npc: TrainerNpc }) {
  return (
    <Link
      to={`/wow-forever/map?npc=${npc.npcId}`}
      aria-label={`Show ${npc.name} on the map`}
      className="inline-flex items-center gap-1 text-sm text-primary underline-offset-2 hover:underline min-h-[44px] sm:min-h-[32px]"
    >
      <MapPin className="h-4 w-4" aria-hidden />
      Show on map
    </Link>
  );
}
