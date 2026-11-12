import type { RecipeDetailResponse } from "@myrecipes/api-client/types/recipe/recipe";
import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import StartCookingButton from "../cook/StartCookingButton";
import { buildCookPages } from "../../utils/buildCookPages";
import { hasCookSteps } from "../../utils/hasCookSteps";
import RecipeFacts from "./RecipeFacts";
import RecipeIngredients from "./RecipeIngredients";
import RecipeSteps from "./RecipeSteps";
import TweakRecipeButton from "./TweakRecipeButton";

export default function RecipeContent({ recipe }: { recipe: RecipeDetailResponse }) {
  const { colors, spacing, fontSize } = useTheme();
  const version = recipe.latest_version;
  const muted = { color: colors.mutedForeground, fontSize: fontSize.sm };

  return (
    <View style={{ gap: spacing.lg }}>
      {recipe.description ? (
        <Text style={{ color: colors.foreground, fontSize: fontSize.md }}>{recipe.description}</Text>
      ) : null}
      {recipe.source ? <Text style={muted}>Source: {recipe.source}</Text> : null}
      {version ? (
        <>
          <RecipeFacts version={version} />
          {hasCookSteps(version) ? (
            <StartCookingButton
              lastPage={buildCookPages(version).length - 1}
              recipeId={recipe.id}
              versionId={version.id}
            />
          ) : null}
          {recipe.is_owner ? <TweakRecipeButton recipeId={recipe.id} /> : null}
          {version.version_number > 1 ? (
            <Text style={muted}>
              Version {version.version_number}
              {version.change_note ? ` · ${version.change_note}` : ""}
            </Text>
          ) : null}
          <RecipeIngredients ingredients={version.ingredients} />
          <RecipeSteps steps={version.steps} />
        </>
      ) : (
        <Text style={muted}>This recipe has no ingredients or steps yet.</Text>
      )}
    </View>
  );
}
