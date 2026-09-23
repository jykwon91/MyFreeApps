import { useState, type FormEvent } from "react";
import type { WorldMapData } from "@/games/wow-forever/types/worldMap";
import { parseCoords } from "@/games/wow-forever/worldMap/parseCoords";

interface PositionInputProps {
  data: WorldMapData;
  onSet: (position: { x: number; y: number }, zoneId: number | null) => void;
}

/** Paste `/way 45.2 61.8` or type `45.2, 61.8`. A zone named in the text switches zones too. */
export default function PositionInput({ data, onSet }: PositionInputProps) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = parseCoords(text);
    if (!parsed) {
      setError("Couldn't read that. Try 45.2, 61.8 or /way 45.2 61.8");
      return;
    }
    let zoneId: number | null = null;
    if (parsed.zoneId !== undefined && data.zoneById.has(parsed.zoneId)) zoneId = parsed.zoneId;
    if (parsed.zoneName) {
      const wanted = parsed.zoneName.toLowerCase();
      zoneId = data.zones.find((z) => z.name.toLowerCase() === wanted)?.id ?? zoneId;
    }
    setError(null);
    setText("");
    onSet({ x: parsed.x, y: parsed.y }, zoneId);
  }

  return (
    <form onSubmit={submit} className="space-y-1">
      <label htmlFor="wm-position" className="text-sm font-medium">
        Your coordinates <span className="font-normal text-muted-foreground">(optional)</span>
      </label>
      <div className="flex gap-2">
        <input
          id="wm-position"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="45.2, 61.8"
          aria-invalid={error !== null}
          aria-describedby={error ? "wm-position-error" : undefined}
          className="min-w-0 flex-1 rounded-md border bg-card px-3 text-sm min-h-[44px]"
        />
        <button type="submit" className="rounded-md border px-3 text-sm min-h-[44px] hover:bg-muted/40">
          Set
        </button>
      </div>
      {error && (
        <p id="wm-position-error" role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </form>
  );
}
