import { LoadingButton, useTheme } from "@platform/mobile";
import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { useSelector } from "react-redux";
import { DISCOVERY_DETAIL_COPY } from "../../constants/discovery";
import type { RootState } from "../../lib/store";

/**
 * Opens the new-recipe form filled in from this recipe, as the website does, so the user checks it
 * before creating it. Once created, the button opens that recipe instead, so it isn't saved twice.
 */
export default function DiscoverySaveAction({ resultId, title }: { resultId: string; title: string }) {
  const { colors, spacing, fontSize } = useTheme();
  const router = useRouter();
  const savedRecipeId = useSelector((state: RootState) => state.discovery.saved[resultId]);

  if (savedRecipeId) {
    return (
      <LoadingButton
        onPress={() => router.push({ pathname: "/recipes/[id]", params: { id: savedRecipeId, title, from: "discover" } })}
        variant="secondary"
      >
        Open saved recipe
      </LoadingButton>
    );
  }
  return (
    <View style={{ gap: spacing.xs }}>
      <LoadingButton onPress={() => router.push({ pathname: "/recipes/new", params: { discovery: resultId } })}>
        Save to my recipes
      </LoadingButton>
      <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>{DISCOVERY_DETAIL_COPY.saveHint}</Text>
    </View>
  );
}
