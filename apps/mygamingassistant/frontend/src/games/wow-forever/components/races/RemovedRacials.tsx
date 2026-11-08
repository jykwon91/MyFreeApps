import { useLocation } from "react-router-dom";
import RacialRow from "@/games/wow-forever/components/races/RacialRow";
import type { Racial } from "@/games/wow-forever/types/races/racial";

/**
 * The racials Forever removed, collapsed at the bottom of the card ("Removed in Forever (2): Diplomacy, …").
 * A link to one of them (`#<key>`) opens the section so its anchor lands on something visible.
 */
export default function RemovedRacials({ racials }: { racials: readonly Racial[] }) {
  const { hash } = useLocation();
  if (racials.length === 0) return null;
  const linked = racials.some((r) => hash === `#${r.key}`);
  return (
    <details key={String(linked)} open={linked || undefined} className="rounded-md border p-2" data-testid="removed-racials">
      <summary className="min-h-[44px] cursor-pointer content-center text-sm">
        <span className="font-medium">Removed in Forever ({racials.length}):</span> {racials.map((r) => r.name).join(", ")}
      </summary>
      <ul className="mt-2 space-y-3">
        {racials.map((r) => (
          <RacialRow key={r.key} racial={r} />
        ))}
      </ul>
    </details>
  );
}
