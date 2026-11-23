import type { Ref } from "react";
import type { DiscoveredRecipe } from "@myrecipes/api-client/types/recipe/discovery";
import type { DiscoveryRead } from "@myrecipes/api-client/types/recipe/discovery-read";
import DiscoveryDetailView from "@/features/discovery/DiscoveryDetailView";
import DiscoveryReadFailed from "@/features/discovery/DiscoveryReadFailed";
import DiscoveryReadWait from "@/features/discovery/DiscoveryReadWait";

interface Props {
  recipe: DiscoveredRecipe;
  /** How far reading this result has got; none until its read is sent. */
  read: DiscoveryRead | undefined;
  /** The recipe this result was already saved as, if it was. */
  savedRecipeId: string | undefined;
  /** The step's heading, focused when Discover moves to it. */
  headingRef: Ref<HTMLHeadingElement>;
  onBack: () => void;
  onRetry: () => void;
  onSave: () => void;
}

/** One opened result: its read in full, the wait for it, or why it failed. */
export default function DiscoveryDetailStep({ recipe, read, savedRecipeId, headingRef, onBack, onRetry, onSave }: Props) {
  if (read?.status === "read") {
    return (
      <DiscoveryDetailView
        detail={read.detail}
        savedRecipeId={savedRecipeId}
        headingRef={headingRef}
        onBack={onBack}
        onSave={onSave}
      />
    );
  }
  if (read?.status === "failed") {
    return (
      <DiscoveryReadFailed
        recipe={recipe}
        message={read.message}
        headingRef={headingRef}
        onRetry={onRetry}
        onBack={onBack}
      />
    );
  }
  return <DiscoveryReadWait recipe={recipe} headingRef={headingRef} onBack={onBack} />;
}
