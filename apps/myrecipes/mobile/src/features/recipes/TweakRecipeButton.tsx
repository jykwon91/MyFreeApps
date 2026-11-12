import { LoadingButton } from "@platform/mobile";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef } from "react";
import { TWEAK_RECIPE_MESSAGES as MESSAGES } from "../../constants/tweakRecipe";
import type { TweakRecipeButtonProps } from "../../types/TweakRecipeButtonProps";

/** Opens the tweak form, for the recipe's owner. Two quick taps open it once. */
export default function TweakRecipeButton({ recipeId }: TweakRecipeButtonProps) {
  const router = useRouter();
  const isOpening = useRef(false);

  useFocusEffect(
    useCallback(() => {
      isOpening.current = false;
    }, []),
  );

  function open(): void {
    if (isOpening.current) return;
    isOpening.current = true;
    router.push({ pathname: "/recipes/[id]/tweak", params: { id: recipeId } });
  }

  return (
    <LoadingButton accessibilityHint={MESSAGES.tweakHint} onPress={open} variant="secondary">
      {MESSAGES.tweak}
    </LoadingButton>
  );
}
