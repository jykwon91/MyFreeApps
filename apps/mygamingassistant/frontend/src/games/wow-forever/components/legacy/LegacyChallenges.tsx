import LegacyCategorySection from "@/games/wow-forever/components/legacy/LegacyCategorySection";
import type { LegacyCategory } from "@/games/wow-forever/types/legacy/legacyCategory";

interface LegacyChallengesProps {
  categories: readonly LegacyCategory[];
  checked: ReadonlySet<string>;
  total: number;
  onToggle: (id: string) => void;
  onClear: () => void;
}

/** Every challenge that earns Legacy points, by category, with a tick list kept in this browser. */
export default function LegacyChallenges({ categories, checked, total, onToggle, onClear }: LegacyChallengesProps) {
  return (
    <section aria-labelledby="legacy-challenges-heading" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="legacy-challenges-heading" className="text-lg font-semibold">
          Challenges that earn points
        </h2>
        <button
          type="button"
          onClick={onClear}
          disabled={checked.size === 0}
          className="min-h-[44px] rounded-md border px-3 text-sm hover:bg-muted/40 disabled:opacity-40"
        >
          Clear ticks
        </button>
      </div>
      <p className="text-sm text-muted-foreground">
        Each challenge earns its points once for the whole account. Tick the ones you've done:{" "}
        <span data-testid="legacy-ticked-count">
          {checked.size} of {total} done
        </span>
        . Ticks are saved in this browser only.
      </p>
      <div className="space-y-2">
        {categories.map((category) => (
          <LegacyCategorySection key={category.name} category={category} checked={checked} onToggle={onToggle} />
        ))}
      </div>
    </section>
  );
}
