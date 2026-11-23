import type { Ref } from "react";
import { DISCOVERY_READ_STAGES } from "@myrecipes/api-client/constants/discovery";
import type { DiscoveredRecipe } from "@myrecipes/api-client/types/recipe/discovery";
import DiscoveryBackButton from "@/features/discovery/DiscoveryBackButton";
import DiscoveryResultsSkeleton from "@/features/discovery/DiscoveryResultsSkeleton";
import DiscoveryStatus from "@/features/discovery/DiscoveryStatus";

interface Props {
  recipe: DiscoveredRecipe;
  /** The step's heading, focused when Discover moves to it. */
  headingRef: Ref<HTMLHeadingElement>;
  onBack: () => void;
}

/**
 * One result while its page is read. Back stays open: the read carries on in the store, so the
 * answer is there when the result is opened again, without paying for a second read.
 */
export default function DiscoveryReadWait({ recipe, headingRef, onBack }: Props) {
  return (
    <div className="space-y-4">
      <DiscoveryBackButton onBack={onBack} />
      <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold leading-tight outline-none">
        {recipe.title}
      </h1>
      <DiscoveryStatus stages={DISCOVERY_READ_STAGES} />
      <DiscoveryResultsSkeleton />
    </div>
  );
}
