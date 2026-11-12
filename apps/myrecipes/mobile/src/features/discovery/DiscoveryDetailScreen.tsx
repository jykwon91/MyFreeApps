import { DISCOVERY_READ_STAGES } from "@myrecipes/api-client/constants/discovery";
import { Banner, EmptyState, LoadingButton, useOpenLink, useTheme } from "@platform/mobile";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";
import { ScrollView, View } from "react-native";
import { useDispatch, useSelector } from "react-redux";
import { ENTRY_POINT_BACK_TITLES } from "../../constants/backTitles";
import { DISCOVER_ROUTE, DISCOVERY_MISSING_RESULT } from "../../constants/discovery";
import type { AppStore, RootState } from "../../lib/store";
import RecipeDetailSkeleton from "../recipes/RecipeDetailSkeleton";
import DiscoveryDetailContent from "./DiscoveryDetailContent";
import DiscoveryDetailHeader from "./DiscoveryDetailHeader";
import DiscoveryStatus from "./DiscoveryStatus";
import { readDiscoveredRecipe } from "./readDiscoveredRecipe";

/**
 * One discovered result, read in full. Pushed over Discover, so the back gesture returns to the
 * results. The read lives in the store: leaving mid-read keeps it going, and reopening a result
 * already read is free.
 */
export default function DiscoveryDetailScreen() {
  const { colors, spacing } = useTheme();
  const router = useRouter();
  const openLink = useOpenLink();
  const dispatch = useDispatch<AppStore["dispatch"]>();
  const { id } = useLocalSearchParams<{ id: string }>();
  const candidate = useSelector((state: RootState) => state.discovery.results?.recipes.find((recipe) => recipe.id === id));
  const read = useSelector((state: RootState) => state.discovery.reads[id]);

  // Opening the result is the tap that asked for the read. One already running or done isn't repeated.
  useEffect(() => {
    if (candidate) void dispatch(readDiscoveredRecipe(candidate));
  }, [candidate, dispatch]);

  function backToResults(): void {
    if (router.canGoBack()) router.back();
    else router.replace(DISCOVER_ROUTE);
  }

  function renderBody() {
    if (read?.status === "read") return <DiscoveryDetailContent detail={read.detail} resultId={id} />;
    if (!candidate) {
      return (
        <EmptyState
          action={{ label: "Back to Discover", onPress: backToResults }}
          body={DISCOVERY_MISSING_RESULT.body}
          heading={DISCOVERY_MISSING_RESULT.heading}
        />
      );
    }
    return (
      <View style={{ gap: spacing.lg }}>
        <DiscoveryDetailHeader
          imageUrl={candidate.image_url}
          siteName={candidate.site_name}
          sourceType={candidate.source_type}
          title={candidate.title}
          url={candidate.url}
        />
        {read?.status === "failed" ? (
          <View style={{ gap: spacing.sm }}>
            <Banner message={read.message} />
            <LoadingButton onPress={() => void dispatch(readDiscoveredRecipe(candidate))}>Try again</LoadingButton>
            <LoadingButton accessibilityHint="Opens in your browser" onPress={() => openLink(candidate.url)} variant="secondary">
              View original
            </LoadingButton>
            <LoadingButton onPress={backToResults} variant="ghost">
              Back to results
            </LoadingButton>
          </View>
        ) : (
          <>
            {read?.status === "reading" ? <DiscoveryStatus stages={DISCOVERY_READ_STAGES} startedAt={read.startedAt} /> : null}
            <RecipeDetailSkeleton />
          </>
        )}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: "", headerBackTitle: ENTRY_POINT_BACK_TITLES.discover }} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }} testID="discovery-detail">
        {renderBody()}
      </ScrollView>
    </View>
  );
}
