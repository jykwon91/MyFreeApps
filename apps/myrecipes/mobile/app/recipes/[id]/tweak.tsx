import { Stack, useLocalSearchParams } from "expo-router";
import { TWEAK_RECIPE_MESSAGES as MESSAGES } from "../../../src/constants/tweakRecipe";
import TweakRecipeScreen from "../../../src/features/tweakRecipe/TweakRecipeScreen";
import { tweakBackTitle } from "../../../src/utils/tweakBackTitle";

export default function TweakRecipeRoute() {
  const { from } = useLocalSearchParams<{ from?: string }>();

  return (
    <>
      <Stack.Screen options={{ title: MESSAGES.screenTitle, headerBackTitle: tweakBackTitle(from) }} />
      <TweakRecipeScreen />
    </>
  );
}
