import WowFeatureTile from "@/games/wow-forever/components/hub/WowFeatureTile";
import WowFeatureIcon from "@/games/wow-forever/components/shared/WowFeatureIcon";
import type { GameFeature } from "@/games/registry";
import type { FeatureCategory } from "@/types/featureCategory";

interface WowFeatureGroupProps {
  category: FeatureCategory;
  /** This category's pages, in display order. */
  features: readonly GameFeature[];
  /** Paths with a "What's new" entry newer than the player's last visit. */
  updates: ReadonlySet<string>;
}

/** One hub section: the category's icon heading (same groups as the left nav), then its page tiles. */
export default function WowFeatureGroup({ category, features, updates }: WowFeatureGroupProps) {
  const headingId = `wow-group-${category.id}`;
  return (
    <section aria-labelledby={headingId} className="space-y-3" data-testid="wow-feature-group">
      <h2 id={headingId} className="flex items-center gap-2 text-xl font-semibold">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <WowFeatureIcon iconName={category.iconName} className="h-5 w-5" />
        </span>
        {category.title}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {features.map((f) => (
          <WowFeatureTile key={f.path} feature={f} hasUpdate={updates.has(f.path)} />
        ))}
      </div>
    </section>
  );
}
