import { useLeaseTemplatesPages } from "@mybookkeeper/api-client/hooks/useLeaseTemplatesPages";
import { Banner, EmptyState, LoadingButton, StaleDataBanner, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useState } from "react";
import { FlatList, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LEASE_TEMPLATE_MESSAGES } from "../../constants/leaseTemplates";
import { continueWithTemplates, NEW_LEASE_MESSAGES as MESSAGES } from "../../constants/newLease";
import { canLoadMore } from "../../lib/canLoadMore";
import { hasCurrentPages } from "../../lib/hasCurrentPages";
import type { NewLeaseFlow } from "../../types/NewLeaseFlow";
import LeaseTemplatesSkeleton, { LeaseTemplateSkeletonRow } from "../leaseTemplates/LeaseTemplatesSkeleton";
import PagedListFooter from "../shell/PagedListFooter";
import { nextPath } from "./newLeaseFlow";
import TemplatePickerRow from "./TemplatePickerRow";

export default function TemplatePickerList({ flow }: { flow: NewLeaseFlow }) {
  const { colors, spacing, fontSize } = useTheme();
  const insets = useSafeAreaInsets();
  const [picked, setPicked] = useState<string[]>(flow.templateIds);
  const templates = useLeaseTemplatesPages();
  const { refresh, refreshControl } = useRefresh(templates.refetch, templates.error);
  const isLoaded = hasCurrentPages(templates);
  const rows = isLoaded ? templates.templates : [];

  function toggle(id: string): void {
    setPicked((current) => (current.includes(id) ? current.filter((other) => other !== id) : [...current, id]));
  }

  const emptyList =
    !isLoaded && templates.isFetching ? (
      <LeaseTemplatesSkeleton />
    ) : !isLoaded ? (
      <EmptyState action={{ label: MESSAGES.tryAgain, onPress: refresh }} body={MESSAGES.checkConnection} heading={MESSAGES.couldntLoadTemplates} />
    ) : (
      <EmptyState
        action={{ label: MESSAGES.addTemplate, onPress: () => router.push("/lease-templates/new") }}
        body={MESSAGES.noTemplatesBody}
        heading={MESSAGES.noTemplatesHeading}
      />
    );

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        ListEmptyComponent={emptyList}
        ListFooterComponent={
          <PagedListFooter
            isLoadingMore={templates.isFetchingNextPage}
            loadMoreFailed={templates.isLoadMoreError}
            loadingLabel={LEASE_TEMPLATE_MESSAGES.loadingMore}
            onRetry={templates.loadMore}
            skeletonRow={<LeaseTemplateSkeletonRow />}
          />
        }
        ListHeaderComponent={
          <View style={{ gap: spacing.sm, padding: spacing.lg }}>
            <StaleDataBanner isShown={Boolean(templates.error && rows.length > 0 && !templates.isLoadMoreError)} />
            {flow.parentLeaseId ? <Banner message={MESSAGES.followsEarlier} tone="success" /> : null}
            <Text accessibilityRole="header" style={{ fontSize: fontSize.xl, fontWeight: "600", color: colors.foreground }}>
              {MESSAGES.whichTemplates}
            </Text>
            <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.pickOrder}</Text>
          </View>
        }
        contentInsetAdjustmentBehavior="automatic"
        data={rows}
        keyExtractor={(template) => template.id}
        onEndReached={() => {
          if (canLoadMore(templates)) templates.loadMore();
        }}
        onEndReachedThreshold={0.5}
        refreshControl={refreshControl}
        renderItem={({ item }) => {
          const index = picked.indexOf(item.id);
          return <TemplatePickerRow onPress={() => toggle(item.id)} position={index === -1 ? null : index + 1} template={item} />;
        }}
        style={{ flex: 1 }}
        testID="template-picker-list"
      />
      {picked.length > 0 ? (
        <View
          style={{
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.md,
            paddingBottom: insets.bottom + spacing.md,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            backgroundColor: colors.background,
          }}
        >
          <LoadingButton onPress={() => router.push(nextPath({ ...flow, templateIds: picked }))}>{continueWithTemplates(picked.length)}</LoadingButton>
        </View>
      ) : null}
    </View>
  );
}
