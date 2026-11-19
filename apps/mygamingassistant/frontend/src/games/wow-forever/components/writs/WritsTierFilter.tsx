import SegmentedToggle from "@/games/wow-forever/components/shared/SegmentedToggle";
import { WRIT_TIER_LABEL, WRIT_TIERS } from "@/games/wow-forever/data/professions/writs/writTiers";
import type { WritTier } from "@/games/wow-forever/types/writs/writTier";
import type { WritTierChoice } from "@/games/wow-forever/types/writs/writTierChoice";

interface WritsTierFilterProps {
  value: WritTier | null;
  counts: Record<WritTier, number> & { all: number };
  onChange: (tier: WritTier | null) => void;
}

/** All / Journeyman / Expert / Artisan, each with how many writs it would show. */
export default function WritsTierFilter({ value, counts, onChange }: WritsTierFilterProps) {
  const options: { id: WritTierChoice; label: string }[] = [
    { id: "all", label: `All (${counts.all})` },
    ...WRIT_TIERS.map((tier) => ({ id: tier, label: `${WRIT_TIER_LABEL[tier]} (${counts[tier]})` })),
  ];
  return (
    <SegmentedToggle<WritTierChoice>
      label="Tier"
      options={options}
      value={value ?? "all"}
      onChange={(next) => onChange(next === "all" ? null : next)}
      compact
      className="flex w-full flex-wrap sm:w-auto"
    />
  );
}
