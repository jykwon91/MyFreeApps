import { FALLBACK_FEATURE_ICON, FEATURE_ICONS } from "@/games/wow-forever/data/featureIcons";

interface WowFeatureIconProps {
  /** `GameFeature.iconName`; unknown names get the fallback icon. */
  iconName: string;
  className?: string;
}

/** A WoW Forever page's icon — the same one in the left nav and on its hub tile. Decorative. */
export default function WowFeatureIcon({ iconName, className }: WowFeatureIconProps) {
  const Icon = FEATURE_ICONS[iconName] ?? FALLBACK_FEATURE_ICON;
  return <Icon className={className} aria-hidden />;
}
