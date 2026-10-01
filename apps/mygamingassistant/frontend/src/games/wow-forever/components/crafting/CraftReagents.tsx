import type { CraftReagent } from "@/games/wow-forever/types/crafting";

/** "2× Bolt of Linen Cloth, 1× Coarse Thread" — per craft. */
export default function CraftReagents({ reagents }: { reagents: readonly CraftReagent[] }) {
  return (
    <ul className="text-sm space-y-0.5">
      {reagents.map((r) => (
        <li key={r.id}>
          {r.count}× {r.name}
        </li>
      ))}
    </ul>
  );
}
