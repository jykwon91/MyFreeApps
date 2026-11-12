import { Stack } from "expo-router";
import { RECIPE_BACK_TITLE } from "../../../src/constants/backTitles";
import { TWEAK_RECIPE_MESSAGES as MESSAGES } from "../../../src/constants/tweakRecipe";
import TweakRecipeScreen from "../../../src/features/tweakRecipe/TweakRecipeScreen";

export default function TweakRecipeRoute() {
  return (
    <>
      <Stack.Screen options={{ title: MESSAGES.screenTitle, headerBackTitle: RECIPE_BACK_TITLE }} />
      <TweakRecipeScreen />
    </>
  );
}
