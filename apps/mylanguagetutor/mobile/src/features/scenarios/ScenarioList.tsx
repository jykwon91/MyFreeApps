import { useScenarioPath } from "@mylanguagetutor/api-client/hooks/useScenarioPath";
import { practicePath } from "@mylanguagetutor/api-client/utils/practicePath";
import { EmptyState, LINK_MESSAGES, ListSeparator, useOpenWebsite, useRefresh, useTheme } from "@platform/mobile";
import { FlatList } from "react-native";
import { WEB_BASE_URL } from "../../constants/api";
import { CATALOG_MESSAGES, SCENARIO_SKELETON_ROWS } from "../../constants/catalog";
import type { ScenarioListProps } from "../../types/ScenarioListProps";
import CardListSkeleton from "../catalog/CardListSkeleton";
import CatalogCard from "../catalog/CatalogCard";
import CatalogLoadError from "../catalog/CatalogLoadError";
import ScenarioListHeader from "./ScenarioListHeader";

/**
 * The scenario learning path for the learner's language. Practice itself isn't in the app yet, so a
 * scenario opens it on the website.
 */
export default function ScenarioList({ profile }: ScenarioListProps) {
  const { colors, spacing } = useTheme();
  const { languageName, scenarios, isError, error, isCapReached, refetch } = useScenarioPath(profile);
  const { refresh, isRefreshing, refreshControl } = useRefresh(refetch, error);
  const openWebsite = useOpenWebsite();

  if (!scenarios) {
    if (isError) return <CatalogLoadError isRetrying={isRefreshing} onRetry={refresh} />;
    return <CardListSkeleton accessibilityLabel={CATALOG_MESSAGES.loadingScenarios} rows={SCENARIO_SKELETON_ROWS} />;
  }

  return (
    <FlatList
      ItemSeparatorComponent={ListSeparator}
      ListEmptyComponent={<EmptyState body={CATALOG_MESSAGES.noScenariosBody} heading={CATALOG_MESSAGES.noScenariosHeading} />}
      ListHeaderComponent={
        <ScenarioListHeader isCapReached={isCapReached} isStale={isError} languageName={languageName} profile={profile} />
      }
      contentContainerStyle={{ flexGrow: 1, padding: spacing.lg }}
      data={scenarios}
      keyExtractor={(scenario) => scenario.slug}
      refreshControl={refreshControl}
      renderItem={({ item }) => (
        <CatalogCard
          accessibilityHint={LINK_MESSAGES.opensBrowser}
          accessibilityRole="link"
          detail={item.goal}
          onPress={() => void openWebsite(WEB_BASE_URL, practicePath(item.slug))}
          prefix={`${item.order}.`}
          title={item.title}
        />
      )}
      style={{ backgroundColor: colors.background }}
      testID="scenario-list"
    />
  );
}
