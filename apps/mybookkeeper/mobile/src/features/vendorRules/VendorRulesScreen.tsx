import { useListClassificationRulesQuery } from "@mybookkeeper/api-client/store/classificationRulesApi";
import { useGetPropertiesQuery } from "@mybookkeeper/api-client/store/propertiesApi";
import { filterRulesByMatchType, groupRulesByMatchType } from "@mybookkeeper/api-client/utils/classificationRules";
import { Banner, EmptyState, LoadingButton, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { SectionList, Text, View } from "react-native";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import { rulesTotalText, VENDOR_RULE_MESSAGES } from "../../constants/vendorRules";
import { useIsAdmin } from "../workspace/useIsAdmin";
import VendorRuleFilterSheet from "./VendorRuleFilterSheet";
import VendorRuleRow from "./VendorRuleRow";
import VendorRulesSkeleton from "./VendorRulesSkeleton";
import { listPropertyName, vendorRuleFilterLabel } from "./vendorRuleDisplay";

export default function VendorRulesScreen() {
  const { colors, spacing, fontSize } = useTheme();
  const isAdmin = useIsAdmin();
  const [matchType, setMatchType] = useState<string | null>(null);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const { currentData, error, isFetching, refetch } = useListClassificationRulesQuery();
  const { data: properties } = useGetPropertiesQuery();
  const { refresh, refreshControl } = useRefresh(async () => {
    await refetch();
  }, error);

  const allGroups = useMemo(() => groupRulesByMatchType(currentData ?? []), [currentData]);
  const sections = useMemo(
    () => groupRulesByMatchType(filterRulesByMatchType(currentData ?? [], matchType)).map((group) => ({ title: group.label, data: group.rules })),
    [currentData, matchType],
  );
  const propertyNames = useMemo(() => new Map((properties ?? []).map((property) => [property.id, property.name])), [properties]);
  const hasRules = (currentData?.length ?? 0) > 0;

  const emptyList = !currentData && (isFetching || !error) ? (
    <VendorRulesSkeleton />
  ) : error && !currentData ? (
    <EmptyState
      action={{ label: VENDOR_RULE_MESSAGES.tryAgain, onPress: refresh }}
      body={VENDOR_RULE_MESSAGES.tryAgainOffer}
      heading={VENDOR_RULE_MESSAGES.couldntLoadList}
    />
  ) : hasRules ? (
    <EmptyState
      action={{ label: VENDOR_RULE_MESSAGES.clearFilters, onPress: () => setMatchType(null) }}
      body={VENDOR_RULE_MESSAGES.tryAnotherFilter}
      heading={VENDOR_RULE_MESSAGES.noMatches}
    />
  ) : (
    <EmptyState body={VENDOR_RULE_MESSAGES.noneBody} heading={VENDOR_RULE_MESSAGES.noneHeading} />
  );

  return (
    <View style={{ flex: 1 }}>
      <SectionList
        ListEmptyComponent={emptyList}
        ListHeaderComponent={
          <View style={{ gap: spacing.md, padding: spacing.lg }}>
            {error && currentData ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
            {hasRules && !isAdmin ? <Banner message={VENDOR_RULE_MESSAGES.viewOnly} /> : null}
            {hasRules ? <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>{rulesTotalText(currentData?.length ?? 0)}</Text> : null}
            {hasRules ? (
              <LoadingButton onPress={() => setIsFilterSheetOpen(true)} variant="secondary">
                {vendorRuleFilterLabel(matchType)}
              </LoadingButton>
            ) : null}
          </View>
        }
        contentInsetAdjustmentBehavior="automatic"
        keyExtractor={(rule) => rule.id}
        refreshControl={refreshControl}
        renderItem={({ item }) => <VendorRuleRow onPress={() => router.push(`/vendor-rules/${item.id}`)} propertyName={listPropertyName(item.property_id, propertyNames)} rule={item} />}
        renderSectionHeader={({ section }) => (
          <Text
            accessibilityRole="header"
            style={{
              backgroundColor: colors.background,
              color: colors.mutedForeground,
              fontSize: fontSize.sm,
              fontWeight: "700",
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.sm,
            }}
          >
            {section.title}
          </Text>
        )}
        sections={sections}
        testID="vendor-rules-list"
      />
      <VendorRuleFilterSheet
        groups={allGroups}
        isOpen={isFilterSheetOpen}
        matchType={matchType}
        onClose={() => setIsFilterSheetOpen(false)}
        onMatchTypeChange={setMatchType}
        total={currentData?.length ?? 0}
      />
    </View>
  );
}
