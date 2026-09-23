import type { MapView } from "@/games/wow-forever/types/worldMap";

interface ChildMapSelectProps {
  /** The maps one level down from the viewed one. */
  maps: readonly MapView[];
  onOpen: (mapId: number) => void;
}

/**
 * "Open a zone" — every map one level down, for keyboards and for maps the
 * picture doesn't draw (Forever's island maps sit on the world map in no
 * continent's rectangle).
 */
export default function ChildMapSelect({ maps, onOpen }: ChildMapSelectProps) {
  if (maps.length === 0) return null;
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">Open a map</span>
      <select
        value=""
        onChange={(e) => {
          const id = Number(e.target.value);
          if (id) onOpen(id);
        }}
        className="rounded-md border bg-background px-2 min-h-[44px] sm:min-h-[32px]"
      >
        <option value="">Choose…</option>
        {maps.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
    </label>
  );
}
