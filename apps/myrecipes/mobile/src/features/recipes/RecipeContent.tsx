import { COMPARE_VERSION_COUNT } from "@myrecipes/api-client/constants/versions";
import type { RecipeDetailResponse } from "@myrecipes/api-client/types/recipe/recipe";
import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import StartCookingButton from "../cook/StartCookingButton";
import { buildCookPages } from "../../utils/buildCookPages";
import { hasCookSteps } from "../../utils/hasCookSteps";
import RecipeFacts from "./RecipeFacts";
import RecipeIngredients from "./RecipeIngredients";
import RecipeSteps from "./RecipeSteps";
import VersionHistoryButton from "../versions/VersionHistoryButton";
import RecipeOwnerActions from "./RecipeOwnerActions";
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
          {/* One version has no history to show or compare, unlike the website's always-on timeline. */}
          {recipe.version_count >= COMPARE_VERSION_COUNT ? (
            <VersionHistoryButton recipeId={recipe.id} versionCount={recipe.version_count} />
          ) : null}
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
      {recipe.is_owner ? <RecipeOwnerActions recipe={recipe} /> : null}
    </View>
  );
}
