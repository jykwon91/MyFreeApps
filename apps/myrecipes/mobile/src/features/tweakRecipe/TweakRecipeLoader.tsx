import { useTweakBase } from "@myrecipes/api-client/hooks/useTweakBase";
import { EmptyState, useAnnouncement, useTheme } from "@platform/mobile";
import { useNavigation, useRouter } from "expo-router";
import { View } from "react-native";
import { TWEAK_RECIPE_MESSAGES as MESSAGES } from "../../constants/tweakRecipe";
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
  const navigation = useNavigation();
  const { base, freshRecipe: recipe, hasFailed, error, refetch } = useTweakBase(recipeId);

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
        action={{ label: MESSAGES.backToRecipe, onPress: () => leaveToRecipe(navigation.getState(), recipeId) }}
        body={MESSAGES.notOwnerBody}
        heading={MESSAGES.notOwnerHeading}
      />
    );
  }

  if (base?.recipe.is_owner) return <TweakRecipeForm recipe={base.recipe} version={base.version} />;
  if (!base && !isGone && !isLoadFailed) return <TweakRecipeSkeleton />;
  return <View style={{ flex: 1, padding: spacing.lg, backgroundColor: colors.background }}>{renderUnavailable()}</View>;
}
