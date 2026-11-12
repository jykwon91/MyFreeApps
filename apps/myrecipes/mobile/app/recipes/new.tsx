import { Stack, useLocalSearchParams } from "expo-router";
import { NEW_RECIPE_MESSAGES as MESSAGES } from "../../src/constants/newRecipe";
import NewRecipeScreen from "../../src/features/newRecipe/NewRecipeScreen";
import { recipeBackTitle } from "../../src/utils/recipeBackTitle";

export default function NewRecipeRoute() {
  const { discovery } = useLocalSearchParams<{ discovery?: string }>();
  const backTitle = recipeBackTitle(discovery ? "discover" : undefined);
  return (
    <>
      <Stack.Screen options={{ title: MESSAGES.screenTitle, headerBackTitle: backTitle }} />
      <NewRecipeScreen />
    </>
  );
}
