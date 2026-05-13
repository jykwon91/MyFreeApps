/**
 * LiveOverridePanel — collapsible row under the LiveTopBar that lets the
 * operator force a specific (map, side) without CS2 running.
 *
 * Use cases:
 *   1. Pre-match prep — load a map on the desktop while not in-game.
 *   2. Testing — verify the lineup strip works without launching CS2.
 *   3. Spectating — drive the display manually while watching a friend.
 *
 * Map options are hardcoded to the active-duty CS2 map pool; this matches
 * the backend `cs2_maps.json` fixture's existing slugs. Workshop maps and
 * non-pool maps aren't surfaced — the operator can still navigate to plan
 * mode via F1 for those.
 */
import { useGetMapsQuery } from "@/store/gamesApi";
import type { GsiSide } from "@/types/desktop";

interface OverrideState {
  enabled: boolean;
  mapSlug: string;
  side: GsiSide;
}

interface LiveOverridePanelProps {
  visible: boolean;
  override: OverrideState;
  onChange: (next: OverrideState) => void;
}

export default function LiveOverridePanel({
  visible,
  override,
  onChange,
}: LiveOverridePanelProps) {
  // Lazily fetch the CS2 map list — only when the override panel is open.
  // The query is cached by RTK Query so opening repeatedly doesn't re-fetch.
  const { data: maps = [], isLoading } = useGetMapsQuery("cs2", { skip: !visible });

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="Manual override"
      className="flex flex-wrap gap-3 items-center px-3 py-2 border-b bg-amber-50/40 dark:bg-amber-950/20"
    >
      <label className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">Map:</span>
        {isLoading ? (
          <span className="inline-block h-7 w-28 rounded bg-muted/40 animate-pulse" />
        ) : (
          <select
            value={override.mapSlug}
            onChange={(e) =>
              onChange({ ...override, mapSlug: e.target.value })
            }
            className="px-2 py-1 rounded-md border bg-card text-xs min-h-[28px]"
          >
            <option value="">— choose map —</option>
            {maps.map((m) => (
              <option key={m.slug} value={m.slug}>
                {m.name}
              </option>
            ))}
          </select>
        )}
      </label>

      <label className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">Side:</span>
        <select
          value={override.side}
          onChange={(e) =>
            onChange({ ...override, side: e.target.value as GsiSide })
          }
          className="px-2 py-1 rounded-md border bg-card text-xs min-h-[28px]"
        >
          <option value="any">Any</option>
          <option value="side_a">T (side_a)</option>
          <option value="side_b">CT (side_b)</option>
        </select>
      </label>

      <p className="text-xs text-muted-foreground ml-auto">
        Override is on — incoming GSI events won't change the display.
      </p>
    </div>
  );
}
