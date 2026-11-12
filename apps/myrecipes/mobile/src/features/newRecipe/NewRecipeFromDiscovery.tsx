import { discoveredRecipeDraft } from "@myrecipes/api-client/utils/discoveredRecipeDraft";
import { EmptyState, useTheme } from "@platform/mobile";
import { useRouter } from "expo-router";
import { View } from "react-native";
import { useDispatch, useSelector } from "react-redux";
import { DISCOVER_ROUTE, DISCOVERY_MISSING_RESULT } from "../../constants/discovery";
import type { RootState } from "../../lib/store";
import { recipeSaved } from "../discovery/discoverySlice";
import NewRecipeForm from "./NewRecipeForm";

/**
 * The new-recipe form filled in from a recipe Discover read, credited to its page. Creating it
 * marks the result saved, so its Discover screen then opens the recipe instead of saving it again.
 */
export default function NewRecipeFromDiscovery({ resultId }: { resultId: string }) {
  const { colors, spacing } = useTheme();
  const router = useRouter();
  const dispatch = useDispatch();
  const read = useSelector((state: RootState) => state.discovery.reads[resultId]);
  // A create that finishes after this account signed out must not mark the next one's result.
  const generation = useSelector((state: RootState) => state.discovery.generation);

  if (read?.status !== "read") {
    // Signing out, or reopening the app, forgets what Discover read.
    return (
      <View style={{ flex: 1, padding: spacing.lg, backgroundColor: colors.background }}>
        <EmptyState
          action={{ label: "Back to Discover", onPress: () => router.replace(DISCOVER_ROUTE) }}
          body={DISCOVERY_MISSING_RESULT.body}
          heading={DISCOVERY_MISSING_RESULT.heading}
        />
      </View>
    );
  }

  const seed = {
    draft: discoveredRecipeDraft(read.detail),
    from: "discover" as const,
    onCreated: (recipeId: string) => dispatch(recipeSaved({ resultId, recipeId, generation })),
  };
  return <NewRecipeForm seed={seed} />;
}
