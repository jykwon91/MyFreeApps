import { PHOTO_IMPORT_COPY } from "@myrecipes/api-client/constants/photoImport";
import { Stack } from "expo-router";
import { RECIPES_BACK_TITLE } from "../../src/constants/backTitles";
import ImportRecipeScreen from "../../src/features/importRecipe/ImportRecipeScreen";

export default function ImportRecipeRoute() {
  return (
    <>
      <Stack.Screen options={{ title: PHOTO_IMPORT_COPY.title, headerBackTitle: RECIPES_BACK_TITLE }} />
      <ImportRecipeScreen />
    </>
  );
}
