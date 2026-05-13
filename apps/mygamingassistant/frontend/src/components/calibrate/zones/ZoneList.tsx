/**
 * ZoneList — left sub-rail in the Zones panel.
 *
 * Lists every polygon in the draft. Each item shows:
 *   - Color swatch (square)
 *   - Slug (kebab-case identifier)
 *   - Name (human-readable display name)
 *   - Per-row "edited" pip when the polygon differs from the loaded baseline
 *
 * Clicking selects the zone. The "+ New zone" button at the bottom enters
 * the editor's `new` mode.
 */
import { cn } from "@platform/ui";
import { Plus } from "lucide-react";
import { isZoneEdited } from "@/lib/calibration";
import UnsavedBadge from "../shared/UnsavedBadge";
import type { CvZonePolygon } from "@/types/desktop";
import { ZONE_FILL_PALETTE } from "./ZoneEditorCanvas";

interface ZoneListProps {
  zones: CvZonePolygon[];
  loadedZones: CvZonePolygon[];
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  onNewZone: () => void;
}

export default function ZoneList({
  zones,
  loadedZones,
  selectedSlug,
  onSelect,
  onNewZone,
}: ZoneListProps) {
  return (
    <aside
      className="flex flex-col border rounded-md bg-card"
      aria-label="Zones list"
    >
      <header className="px-3 py-2 border-b text-xs font-medium text-muted-foreground uppercase">
        Zones
      </header>
      <div className="flex-1 overflow-auto max-h-[60vh]">
        {zones.length === 0 ? (
          <p className="p-4 text-xs text-muted-foreground">
            No zones yet. Click <strong>+ New zone</strong> below to add one.
          </p>
        ) : (
          <ul className="divide-y">
            {zones.map((z) => {
              const isActive = z.slug === selectedSlug;
              const edited = isZoneEdited(z, loadedZones);
              return (
                <li key={z.slug}>
                  <button
                    type="button"
                    onClick={() => onSelect(z.slug)}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 text-sm text-left min-h-[44px]",
                      "transition-colors",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "hover:bg-muted/40 text-foreground",
                    )}
                    aria-current={isActive ? "true" : undefined}
                    data-testid={`zone-list-${z.slug}`}
                  >
                    <span
                      className="w-3 h-3 rounded-sm border border-white/30 shrink-0"
                      style={{ backgroundColor: colorForSlug(z.slug) }}
                      aria-hidden
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block text-xs font-mono text-muted-foreground truncate">
                        {z.slug}
                      </span>
                      <span className="block text-sm truncate">{z.name}</span>
                    </span>
                    {edited && <UnsavedBadge compact />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <footer className="border-t p-2">
        <button
          type="button"
          onClick={onNewZone}
          className="w-full flex items-center justify-center gap-1 px-3 py-2 text-sm rounded-md border border-dashed hover:bg-muted/40 min-h-[44px]"
          data-testid="zone-list-new-button"
        >
          <Plus className="w-4 h-4" aria-hidden />
          New zone
        </button>
      </footer>
    </aside>
  );
}

function colorForSlug(slug: string): string {
  let hash = 0;
  for (let i = 0; i < slug.length; i += 1) {
    hash = (hash * 31 + slug.charCodeAt(i)) & 0xffffffff;
  }
  return ZONE_FILL_PALETTE[Math.abs(hash) % ZONE_FILL_PALETTE.length];
}
