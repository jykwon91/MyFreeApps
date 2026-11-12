import { useGetRecipeQuery } from "@myrecipes/api-client/store/recipesApi";
import { EmptyState, useAnnouncement, useTheme } from "@platform/mobile";
import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { TWEAK_RECIPE_MESSAGES as MESSAGES } from "../../constants/tweakRecipe";
import { useErrorSinceOpening } from "../../hooks/useErrorSinceOpening";
import type { TweakBase } from "../../types/TweakBase";
import type { TweakRecipeLoaderProps } from "../../types/TweakRecipeLoaderProps";
import { isNotFoundError } from "../../utils/isNotFoundError";
import { leaveToRecipe } from "../../utils/leaveToRecipe";
import TweakRecipeForm from "./TweakRecipeForm";
import TweakRecipeSkeleton from "./TweakRecipeSkeleton";

/**
 * The recipe to tweak, then its form. Only its owner can make a new version, so anyone else is told
 * so, as on the website, rather than given a form that can't save.
 */
export default function TweakRecipeLoader({ recipeId }: TweakRecipeLoaderProps) {
  const { colors, spacing } = useTheme();
  const router = useRouter();
  // Asked for again on opening, so the tweak starts from the latest version, not one cached earlier.
  const { currentData, error, isError, fulfilledTimeStamp, refetch } = useGetRecipeQuery(recipeId, {
    refetchOnMountOrArgChange: true,
  });
  const hasFailed = useErrorSinceOpening(error, isError);
  // Only an answer that came after opening counts: a cached one may be out of date.
  const [cachedAt] = useState(fulfilledTimeStamp);
  const recipe = fulfilledTimeStamp !== cachedAt ? currentData : undefined;

  // Frozen once loaded: saving or a later refetch mustn't move the version the tweak starts from.
  const [base, setBase] = useState<TweakBase | null>(null);
  if (!base && recipe?.latest_version) setBase({ recipe, version: recipe.latest_version });

  const isGone = !base && ((hasFailed && isNotFoundError(error)) || (!!recipe && !recipe.latest_version));
  const isLoadFailed = !base && !isGone && hasFailed;
  useAnnouncement(isGone ? MESSAGES.notFoundHeading : isLoadFailed ? MESSAGES.loadFailedHeading : undefined);

  function renderUnavailable() {
    if (isGone) {
      return (
        <EmptyState
          action={{ label: MESSAGES.backToRecipes, onPress: () => router.replace("/") }}
          body={MESSAGES.notFoundBody}
          heading={MESSAGES.notFoundHeading}
        />
      );
    }
    if (isLoadFailed) {
      return (
        <EmptyState
          action={{ label: MESSAGES.tryAgain, onPress: () => void refetch() }}
          body={MESSAGES.loadFailedBody}
          heading={MESSAGES.loadFailedHeading}
        />
      );
    }
    return (
      <EmptyState
        action={{ label: MESSAGES.backToRecipe, onPress: () => leaveToRecipe(recipeId) }}
        body={MESSAGES.notOwnerBody}
        heading={MESSAGES.notOwnerHeading}
      />
    );
  }

  if (base?.recipe.is_owner) return <TweakRecipeForm recipe={base.recipe} version={base.version} />;
  if (!base && !isGone && !isLoadFailed) return <TweakRecipeSkeleton />;
  return <View style={{ flex: 1, padding: spacing.lg, backgroundColor: colors.background }}>{renderUnavailable()}</View>;
}
