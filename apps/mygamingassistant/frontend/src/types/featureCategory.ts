import type { FeatureCategoryId } from "@/types/featureCategoryId";

/** A named group of a companion game's pages: a sidebar heading and a hub section. */
export interface FeatureCategory {
  id: FeatureCategoryId;
  title: string;
  /** Lucide icon name for the hub section heading (see the game's FEATURE_ICONS). */
  iconName: string;
}
