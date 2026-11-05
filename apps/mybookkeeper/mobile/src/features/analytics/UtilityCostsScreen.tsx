import { useGetUtilityTrendsQuery } from "@mybookkeeper/api-client/store/analyticsApi";
import { useGetPropertiesQuery } from "@mybookkeeper/api-client/store/propertiesApi";
import { EmptyState, OptionSheet, useRefresh } from "@platform/mobile";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList } from "react-native";
import { ALL_PROPERTIES, UTILITY_COSTS_MESSAGES as MESSAGES } from "../../constants/analytics";
import type { UtilityCostsPreset } from "../../types/UtilityCostsPreset";
import { useToday } from "../../lib/useToday";
import { useCanWrite } from "../workspace/useCanWrite";
import UtilityCostMonthRow from "./UtilityCostMonthRow";
import { isCurrentMonth, monthRows, presetRange, rangeLabel, totalCents, utilityRows } from "./utilityCostsDisplay";
import UtilityCostsHeader from "./UtilityCostsHeader";
import UtilityCostsSkeleton from "./UtilityCostsSkeleton";

export default function UtilityCostsScreen() {
  const canWrite = useCanWrite();
  const [preset, setPreset] = useState<UtilityCostsPreset>("last12");
  const [propertyId, setPropertyId] = useState<string>(ALL_PROPERTIES);
  const [isChoosingProperty, setIsChoosingProperty] = useState(false);
  const [expandedPeriod, setExpandedPeriod] = useState<string | null>(null);
  const today = useToday();
  const range = useMemo(() => presetRange(preset, today), [preset, today]);
  const { currentData, error, isFetching, refetch } = useGetUtilityTrendsQuery({
    startDate: range.startDate,
    endDate: range.endDate,
    propertyIds: propertyId === ALL_PROPERTIES ? undefined : [propertyId],
    granularity: "monthly",
  });
  const { data: properties = [], error: propertiesError, refetch: refetchProperties } = useGetPropertiesQuery();
  const { refresh, refreshControl } = useRefresh(async () => {
    await Promise.all([refetch(), propertiesError ? refetchProperties() : undefined]);
  }, error);

  const trends = currentData?.trends;
  const rows = useMemo(() => (trends ? utilityRows(trends) : null), [trends]);
  const months = useMemo(() => (trends && trends.length > 0 ? monthRows(trends, range) : []), [trends, range]);
  const largestMonthCents = Math.max(0, ...months.map((month) => month.cents));
  const isDefaultView = preset === "last12" && propertyId === ALL_PROPERTIES;
  const propertyOptions = [
    { value: ALL_PROPERTIES, label: MESSAGES.allProperties },
    ...properties.map((property) => ({ value: property.id, label: property.name })),
  ];
  const selectedProperty = propertyOptions.find((option) => option.value === propertyId);

  function emptyList() {
    if (currentData && !isDefaultView) {
      return (
        <EmptyState
          action={{
            label: MESSAGES.showDefault,
            onPress: () => {
              setPreset("last12");
              setPropertyId(ALL_PROPERTIES);
            },
          }}
          body={MESSAGES.noneInRangeBody}
          heading={MESSAGES.noneInRangeHeading}
        />
      );
    }
    if (currentData) {
      return (
        <EmptyState
          action={canWrite ? { label: MESSAGES.takePhoto, onPress: () => router.push("/camera") } : undefined}
          body={canWrite ? MESSAGES.noneBodyWriter : MESSAGES.noneBodyViewer}
          heading={MESSAGES.noneHeading}
        />
      );
    }
    if (isFetching) return <UtilityCostsSkeleton />;
    return <EmptyState action={{ label: MESSAGES.tryAgain, onPress: refresh }} body={MESSAGES.checkConnection} heading={MESSAGES.couldntLoad} />;
  }

  return (
    <>
      <FlatList
        ListEmptyComponent={emptyList()}
        ListHeaderComponent={
          <UtilityCostsHeader
            onChangePreset={(next) => {
              setPreset(next);
              setExpandedPeriod(null);
            }}
            onChooseProperty={() => setIsChoosingProperty(true)}
            preset={preset}
            propertiesFailed={Boolean(propertiesError) && properties.length === 0}
            propertyName={properties.length > 1 && selectedProperty ? selectedProperty.label : null}
            range={rangeLabel(range)}
            rows={rows}
            showLastLoaded={Boolean(error) && currentData !== undefined}
            totalCents={rows ? totalCents(rows) : 0}
          />
        }
        contentInsetAdjustmentBehavior="automatic"
        data={months}
        keyExtractor={(month) => month.period}
        refreshControl={refreshControl}
        renderItem={({ item }) => (
          <UtilityCostMonthRow
            isExpanded={expandedPeriod === item.period}
            isPartial={isCurrentMonth(item.period, today)}
            largestCents={largestMonthCents}
            month={item}
            onToggle={() => setExpandedPeriod((open) => (open === item.period ? null : item.period))}
          />
        )}
        testID="utility-costs-list"
      />
      <OptionSheet
        isOpen={isChoosingProperty}
        onClose={() => setIsChoosingProperty(false)}
        onSelect={(chosen) => {
          setIsChoosingProperty(false);
          setPropertyId(chosen);
          setExpandedPeriod(null);
        }}
        options={propertyOptions}
        title={MESSAGES.property}
        value={propertyId}
      />
    </>
  );
}
