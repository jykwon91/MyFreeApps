import { useScenarioPath } from "@mylanguagetutor/api-client/hooks/useScenarioPath";
import { practicePath } from "@mylanguagetutor/api-client/utils/practicePath";
import { EmptyState, ListSeparator, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { FlatList } from "react-native";
import { CATALOG_MESSAGES, SCENARIO_SKELETON_ROWS } from "../../constants/catalog";
import type { ScenarioListProps } from "../../types/ScenarioListProps";
import CardListSkeleton from "../catalog/CardListSkeleton";
import CatalogCard from "../catalog/CatalogCard";
import CatalogLoadError from "../catalog/CatalogLoadError";
import ScenarioListHeader from "./ScenarioListHeader";

/** The scenario learning path for the learner's language. A scenario opens its conversation. */
export default function ScenarioList({ profile }: ScenarioListProps) {
  const { colors, spacing } = useTheme();
  const { languageName, scenarios, isError, error, isCapReached, refetch } = useScenarioPath(profile);
  const { refresh, isRefreshing, refreshControl } = useRefresh(refetch, error);

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
          detail={item.goal}
          onPress={() => router.push(practicePath(item.slug))}
          prefix={`${item.order}.`}
          title={item.title}
        />
      )}
      style={{ backgroundColor: colors.background }}
      testID="scenario-list"
    />
  );
}
