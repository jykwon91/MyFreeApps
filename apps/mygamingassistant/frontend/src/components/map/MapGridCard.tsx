import { useState } from "react";
import { Link } from "react-router-dom";
import { Map } from "lucide-react";
import type { GameMap } from "@/types/game";

interface MapGridCardProps {
  map: GameMap;
  gameSlug: string;
}

/** One map on a game's map grid — its minimap thumbnail (or a map icon) and name. */
export default function MapGridCard({ map, gameSlug }: MapGridCardProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = map.minimap_url && !imageFailed;

  return (
    <Link
      to={`/${gameSlug}/${map.slug}`}
      className="group flex flex-col items-center justify-center h-24 rounded-xl border bg-card hover:bg-muted/40 transition-colors p-4 gap-2"
    >
      {showImage ? (
        <img
          src={map.minimap_url ?? ""}
          alt={map.name}
          className="h-10 w-10 rounded object-cover group-hover:scale-105 transition-transform"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <Map className="h-8 w-8 text-muted-foreground group-hover:text-primary transition-colors" />
      )}
      <span className="text-sm font-medium capitalize">{map.name}</span>
    </Link>
  );
}
