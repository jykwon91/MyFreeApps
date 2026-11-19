import SegmentedToggle from "@/games/wow-forever/components/shared/SegmentedToggle";
import type { TierChoice } from "@/games/wow-forever/types/professionTiers/tierChoice";
import type { TierCounts } from "@/games/wow-forever/types/professionTiers/tierCounts";

interface ProfessionTierFilterProps<T extends string> {
  /** Lowest rank first. */
  tiers: readonly T[];
  labels: Readonly<Record<T, string>>;
  value: T | null;
  counts: TierCounts<T>;
  onChange: (tier: T | null) => void;
}

/** All plus each tier, each with how many rows it would show. */
export default function ProfessionTierFilter<T extends string>({ tiers, labels, value, counts, onChange }: ProfessionTierFilterProps<T>) {
  const options: { id: TierChoice<T>; label: string }[] = [
    { id: "all", label: `All (${counts.all})` },
    ...tiers.map((tier) => ({ id: tier, label: `${labels[tier]} (${counts[tier]})` })),
  ];
  return (
    <SegmentedToggle<TierChoice<T>>
      label="Tier"
      options={options}
      value={value ?? "all"}
      onChange={(next) => onChange(next === "all" ? null : next)}
      compact
      className="flex w-full flex-wrap sm:w-auto"
    />
  );
}
