import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import UpdateDot from "@/games/wow-forever/components/shared/UpdateDot";
import WowFeatureIcon from "@/games/wow-forever/components/shared/WowFeatureIcon";
import type { GameFeature } from "@/games/registry";

interface WowFeatureTileProps {
  feature: GameFeature;
  /** The page has a "What's new" entry newer than the player's last visit. */
  hasUpdate: boolean;
}

/** One hub tile: the page's icon (same as the left nav), title, update dot and description. */
export default function WowFeatureTile({ feature, hasUpdate }: WowFeatureTileProps) {
  return (
    <Link
      to={feature.path}
      className="group flex gap-4 rounded-xl border bg-card p-4 sm:p-5 hover:bg-muted/40 transition-colors min-w-0"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <WowFeatureIcon iconName={feature.iconName} className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1 space-y-1">
        <span className="flex items-center justify-between gap-2 text-lg font-semibold">
          <span className="flex min-w-0 items-center gap-2">
            <span className="break-words">{feature.title}</span>
            {hasUpdate && <UpdateDot />}
          </span>
          <ArrowRight
            className="h-5 w-5 shrink-0 text-primary group-hover:translate-x-1 transition-transform"
            aria-hidden
          />
        </span>
        <span className="block text-sm text-muted-foreground">{feature.description}</span>
      </span>
    </Link>
  );
}
