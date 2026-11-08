import LegacyChallengeRow from "@/games/wow-forever/components/legacy/LegacyChallengeRow";
import { categoryTicks } from "@/games/wow-forever/lib/legacy/legacyChallengeCounts";
import type { LegacyCategory } from "@/games/wow-forever/types/legacy/legacyCategory";

interface LegacyCategorySectionProps {
  category: LegacyCategory;
  checked: ReadonlySet<string>;
  onToggle: (id: string) => void;
}

/** One category, collapsed, its summary counting the ticks ("Classes 4/27"). */
export default function LegacyCategorySection({ category, checked, onToggle }: LegacyCategorySectionProps) {
  const [done, total] = categoryTicks(category, checked);
  return (
    <details className="rounded-xl border bg-card" data-testid={`legacy-category-${category.name}`}>
      <summary className="flex min-h-[44px] cursor-pointer items-center justify-between gap-2 px-3 font-medium">
        <span>{category.name}</span>
        <span className="text-sm font-normal tabular-nums text-muted-foreground">
          {done}/{total}
        </span>
      </summary>
      <div className="space-y-3 px-1 pb-2 sm:px-2">
        {category.groups.map((group) => (
          <div key={group.name ?? category.name}>
            {group.name ? <h4 className="px-2 pt-1 text-sm font-semibold text-muted-foreground">{group.name}</h4> : null}
            <ul>
              {group.challenges.map((challenge) => (
                <LegacyChallengeRow
                  key={challenge.id}
                  challenge={challenge}
                  checked={checked.has(challenge.id)}
                  onToggle={() => onToggle(challenge.id)}
                />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </details>
  );
}
