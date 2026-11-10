import { useGetLeaseTemplatesQuery } from "@mybookkeeper/api-client/store/leaseTemplatesApi";
import { Banner, EmptyState, LoadingButton, useOpenWebsite, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useState } from "react";
import { FlatList, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WEB_BASE_URL } from "../../constants/api";
import { LEASE_TEMPLATE_LIST_LIMIT } from "../../constants/leaseTemplates";
import { continueWithTemplates, NEW_LEASE_MESSAGES as MESSAGES } from "../../constants/newLease";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import type { NewLeaseFlow } from "../../types/NewLeaseFlow";
import LeaseTemplatesSkeleton from "../leaseTemplates/LeaseTemplatesSkeleton";
import MoreOnWebsite from "./MoreOnWebsite";
import { nextPath } from "./newLeaseFlow";
import TemplatePickerRow from "./TemplatePickerRow";

export default function TemplatePickerList({ flow }: { flow: NewLeaseFlow }) {
  const { colors, spacing, fontSize } = useTheme();
  const insets = useSafeAreaInsets();
  const openWebsite = useOpenWebsite();
  const [picked, setPicked] = useState<string[]>(flow.templateIds);
  const { currentData, error, isFetching, refetch } = useGetLeaseTemplatesQuery({ limit: LEASE_TEMPLATE_LIST_LIMIT });
  const { refresh, refreshControl } = useRefresh(refetch, error);
  const rows = currentData?.items ?? [];

  function toggle(id: string): void {
    setPicked((current) => (current.includes(id) ? current.filter((other) => other !== id) : [...current, id]));
  }

  const emptyList =
    !currentData && isFetching ? (
      <LeaseTemplatesSkeleton />
    ) : !currentData ? (
      <EmptyState action={{ label: MESSAGES.tryAgain, onPress: refresh }} body={MESSAGES.checkConnection} heading={MESSAGES.couldntLoadTemplates} />
    ) : (
      <EmptyState
        action={{ label: MESSAGES.openWebsite, onPress: () => openWebsite(WEB_BASE_URL, "/lease-templates") }}
        body={MESSAGES.noTemplatesBody}
        heading={MESSAGES.noTemplatesHeading}
      />
    );

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        ListEmptyComponent={emptyList}
        ListFooterComponent={currentData?.has_more ? <MoreOnWebsite path="/lease-templates" /> : undefined}
        ListHeaderComponent={
          <View style={{ gap: spacing.sm, padding: spacing.lg }}>
            {error && rows.length > 0 ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
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
        refreshControl={refreshControl}
        renderItem={({ item }) => {
          const index = picked.indexOf(item.id);
          return <TemplatePickerRow onPress={() => toggle(item.id)} position={index === -1 ? null : index + 1} template={item} />;
        }}
        style={{ flex: 1 }}
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
