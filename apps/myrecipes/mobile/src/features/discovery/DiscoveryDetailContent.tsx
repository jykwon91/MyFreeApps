import type { DiscoveredDetail } from "@myrecipes/api-client/types/recipe/discovery";
import { LoadingButton, useOpenLink, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { DISCOVERY_DETAIL_COPY } from "../../constants/discovery";
import { draftRecipeLines } from "../../utils/draftRecipeLines";
import RecipeFacts from "../recipes/RecipeFacts";
import RecipeIngredients from "../recipes/RecipeIngredients";
import RecipeSteps from "../recipes/RecipeSteps";
import DiscoveryDetailHeader from "./DiscoveryDetailHeader";
import DiscoveryNotes from "./DiscoveryNotes";
import DiscoverySaveAction from "./DiscoverySaveAction";
import DiscoverySources from "./DiscoverySources";

/**
 * The full read of one discovered recipe: what it is, why it's worth cooking and the recipe
 * itself, before any of it is saved. A reading view, not an editor.
 */
export default function DiscoveryDetailContent({ detail, resultId }: { detail: DiscoveredDetail; resultId: string }) {
  const { colors, spacing, fontSize } = useTheme();
  const openLink = useOpenLink();
  const lines = draftRecipeLines(detail.draft);

  return (
    <View style={{ gap: spacing.lg }}>
      <DiscoveryDetailHeader
        imageUrl={detail.image_url}
        siteName={detail.site_name}
        sourceType={detail.source_type}
        title={detail.title}
        url={detail.url}
      />
      {detail.summary ? <Text style={{ color: colors.foreground, fontSize: fontSize.md }}>{detail.summary}</Text> : null}
      <View style={{ gap: spacing.sm }}>
        <DiscoverySaveAction resultId={resultId} title={detail.title} />
        <LoadingButton accessibilityHint="Opens in your browser" onPress={() => openLink(detail.url)} variant="ghost">
          View original
        </LoadingButton>
      </View>
      <RecipeFacts version={detail.draft} />
      <RecipeIngredients emptyText={DISCOVERY_DETAIL_COPY.noIngredients} ingredients={lines.ingredients} />
      <RecipeSteps emptyText={DISCOVERY_DETAIL_COPY.noSteps} steps={lines.steps} />
      <DiscoveryNotes heading={DISCOVERY_DETAIL_COPY.tipsHeading} notes={detail.tips} />
      <DiscoveryNotes heading={DISCOVERY_DETAIL_COPY.communityHeading} notes={detail.community_notes} />
      <DiscoverySources sources={detail.sources} />
    </View>
  );
}
