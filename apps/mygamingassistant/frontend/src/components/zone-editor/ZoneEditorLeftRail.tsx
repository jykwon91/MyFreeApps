/**
 * Left rail for the zone editor — zone list with status dots.
 *
 * Status dot meanings:
 *   green  — polygon authored AND matches server baseline
 *   amber  — polygon authored AND differs from server baseline (dirty)
 *   grey   — no polygon yet (operator hasn't drawn this zone)
 *
 * Single-click on a zone with no polygon dispatches `onClickEmptyZone` so
 * the parent can auto-enter `new` mode — saves 3 clicks per zone over a
 * "click zone, look at right rail, click Draw" flow.
 */
import type { MapZone } from "@/types/game";
import type { PointObject } from "@/lib/zonePolygon";

export interface ZoneEditorLeftRailProps {
  zones: MapZone[];
  /** Draft polygon state keyed by slug. */
  draftZones: Record<string, PointObject[]>;
  /** Slugs whose draft differs from the server baseline. */
  dirtySlugs: Set<string>;
  selectedSlug: string | null;
  onSelectFilledZone: (slug: string) => void;
  onClickEmptyZone: (slug: string) => void;
}

export default function ZoneEditorLeftRail({
  zones,
  draftZones,
  dirtySlugs,
  selectedSlug,
  onSelectFilledZone,
  onClickEmptyZone,
}: ZoneEditorLeftRailProps) {
  return (
    <aside className="w-full lg:w-60 border-b lg:border-b-0 lg:border-r bg-card flex flex-col">
      <div className="px-3 py-2 border-b text-xs text-muted-foreground">
        Zones ({zones.length})
      </div>
      <ul className="flex-1 overflow-y-auto">
        {zones.map((z) => {
          const points = draftZones[z.slug] ?? [];
          const hasPolygon = points.length >= 3;
          const isDirty = dirtySlugs.has(z.slug);
          const isSelected = z.slug === selectedSlug;
          const dotCls = dotClass({ hasPolygon, isDirty });
          return (
            <li key={z.id}>
              <button
                type="button"
                onClick={() => {
                  if (hasPolygon) {
                    onSelectFilledZone(z.slug);
                  } else {
                    onClickEmptyZone(z.slug);
                  }
                }}
                className={[
                  "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/40 transition-colors text-left",
                  isSelected ? "bg-muted/50" : "",
                ].join(" ")}
                aria-current={isSelected ? "true" : undefined}
              >
                <span
                  className={`inline-block w-2 h-2 rounded-full shrink-0 ${dotCls}`}
                  aria-hidden
                />
                <span className="flex-1 truncate">{z.name}</span>
                {!hasPolygon && (
                  <span className="text-xs text-muted-foreground">
                    Draw
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="px-3 py-2 border-t text-[11px] text-muted-foreground">
        Zone names are seeded from the fixture. New zones require an
        admin update.
      </div>
    </aside>
  );
}

function dotClass({
  hasPolygon,
  isDirty,
}: {
  hasPolygon: boolean;
  isDirty: boolean;
}): string {
  if (isDirty) return "bg-amber-500";
  if (hasPolygon) return "bg-emerald-500";
  return "bg-muted-foreground/30";
}
