import { Stack } from "expo-router";
import { NEW_RECIPE_MESSAGES as MESSAGES } from "../../src/constants/newRecipe";
import NewRecipeScreen from "../../src/features/newRecipe/NewRecipeScreen";

export default function NewRecipeRoute() {
  return (
    <>
      <Stack.Screen options={{ title: MESSAGES.screenTitle, headerBackTitle: MESSAGES.backTitle }} />
      <NewRecipeScreen />
    </>
  );
}
