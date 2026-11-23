import type { Ref } from "react";
import { AlertBox, Button } from "@platform/ui";
import type { DiscoveredRecipe } from "@myrecipes/api-client/types/recipe/discovery";
import DiscoveryBackButton from "@/features/discovery/DiscoveryBackButton";
import DiscoveryOriginalLink from "@/features/discovery/DiscoveryOriginalLink";

interface Props {
  recipe: DiscoveredRecipe;
  /** Why the read failed. */
  message: string;
  /** The step's heading, focused when Discover moves to it. */
  headingRef: Ref<HTMLHeadingElement>;
  onRetry: () => void;
  onBack: () => void;
}

/**
 * One result whose page couldn't be read. It stays open with the ways on, as on the phone: read
 * it again, open the page itself, or go back to the other results.
 */
export default function DiscoveryReadFailed({ recipe, message, headingRef, onRetry, onBack }: Props) {
  return (
    <div className="space-y-4">
      <DiscoveryBackButton onBack={onBack} />
      <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold leading-tight outline-none">
        {recipe.title}
      </h1>
      <AlertBox variant="warning" role="alert">{message}</AlertBox>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={onRetry}>Try again</Button>
        <DiscoveryOriginalLink url={recipe.url} />
      </div>
    </div>
  );
}
