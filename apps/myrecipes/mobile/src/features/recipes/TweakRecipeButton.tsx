import { LoadingButton } from "@platform/mobile";
import { useRouter } from "expo-router";
import { TWEAK_RECIPE_MESSAGES as MESSAGES } from "../../constants/tweakRecipe";
import { useOpenOnce } from "../../hooks/useOpenOnce";
import type { TweakRecipeButtonProps } from "../../types/TweakRecipeButtonProps";

/** Opens the tweak form, for the recipe's owner. Two quick taps open it once. */
export default function TweakRecipeButton({ recipeId, from }: TweakRecipeButtonProps) {
  const router = useRouter();
  const open = useOpenOnce(() =>
    router.push({ pathname: "/recipes/[id]/tweak", params: from ? { id: recipeId, from } : { id: recipeId } }),
  );

  return (
    <LoadingButton accessibilityHint={MESSAGES.tweakHint} onPress={open} variant="secondary">
      {MESSAGES.tweak}
    </LoadingButton>
  );
}
