import { FISH_RECIPES } from "@/games/wow-forever/data/professions/fishing";

/** Every fish you catch has a cooking recipe — level both together. */
export default function FishRecipesList() {
  return (
    <details className="rounded-xl border bg-card p-3">
      <summary className="cursor-pointer font-medium min-h-[44px] sm:min-h-0 flex items-center">
        Cook what you catch — cooking skill needed for each fish
      </summary>
      <ul className="mt-2 space-y-1 text-sm">
        {FISH_RECIPES.map((r) => (
          <li key={r.skill} className="grid grid-cols-[3rem_1fr] gap-2">
            <span className="font-semibold">{r.skill}</span>
            <span>{r.fish}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
