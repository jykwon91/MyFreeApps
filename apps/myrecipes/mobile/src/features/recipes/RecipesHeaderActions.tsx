import { PHOTO_IMPORT_COPY } from "@myrecipes/api-client/constants/photoImport";
import { useTheme } from "@platform/mobile";
import { useRouter } from "expo-router";
import { View } from "react-native";
import { IMPORT_RECIPE_MESSAGES, IMPORT_RECIPE_ROUTE } from "../../constants/importRecipe";
import { NEW_RECIPE_MESSAGES } from "../../constants/newRecipe";
import HeaderTextButton from "./HeaderTextButton";

/** In the Recipes header, as the website heads its list with Import from photo and New recipe. */
export default function RecipesHeaderActions() {
  const { spacing } = useTheme();
  const router = useRouter();

  return (
    <View style={{ flexDirection: "row", paddingRight: spacing.sm }}>
      <HeaderTextButton
        label={PHOTO_IMPORT_COPY.title}
        onPress={() => router.push(IMPORT_RECIPE_ROUTE)}
        shortLabel={IMPORT_RECIPE_MESSAGES.importShort}
      />
      <HeaderTextButton
        label={NEW_RECIPE_MESSAGES.newRecipe}
        onPress={() => router.push("/recipes/new")}
        shortLabel={NEW_RECIPE_MESSAGES.newRecipeShort}
      />
    </View>
  );
}
