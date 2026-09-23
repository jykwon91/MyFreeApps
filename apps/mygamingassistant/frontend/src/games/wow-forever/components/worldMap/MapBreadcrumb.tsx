import { ChevronRight, ZoomOut } from "lucide-react";
import type { MapView } from "@/games/wow-forever/types/worldMap";

interface MapBreadcrumbProps {
  /** World map first, the viewed map last. */
  path: readonly MapView[];
  onOpen: (mapId: number) => void;
}

/** Azeroth › Eastern Kingdoms › Elwynn Forest, plus the in-game "zoom out" button. */
export default function MapBreadcrumb({ path, onOpen }: MapBreadcrumbProps) {
  const current = path[path.length - 1];
  const parent = path.length > 1 ? path[path.length - 2] : null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={!parent}
        onClick={() => parent && onOpen(parent.id)}
        title={parent ? `Zoom out to ${parent.name} (right-click the map or press Esc)` : "This is the whole world"}
        className="inline-flex items-center gap-1.5 rounded-md border px-3 text-sm min-h-[44px] sm:min-h-[32px] hover:bg-muted/40 disabled:opacity-50 disabled:hover:bg-transparent"
      >
        <ZoomOut className="h-4 w-4" aria-hidden />
        Zoom out
      </button>
      <nav aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-1 text-sm">
          {path.map((map) => (
            <li key={map.id} className="flex items-center gap-1">
              {map !== path[0] && <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />}
              {map === current && (
                <span aria-current="page" className="font-semibold">
                  {map.name}
                </span>
              )}
              {map !== current && (
                <button
                  type="button"
                  onClick={() => onOpen(map.id)}
                  className="rounded px-1 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline min-h-[44px] sm:min-h-[28px]"
                >
                  {map.name}
                </button>
              )}
            </li>
          ))}
        </ol>
      </nav>
    </div>
  );
}
