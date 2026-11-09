import { useGetPropertyPnlQuery } from "@mybookkeeper/api-client/store/attributionApi";
import type { PropertyPnLRange } from "@mybookkeeper/api-client/types/attribution/property-pnl-range";
import { propertyPnlRange } from "@mybookkeeper/api-client/utils/propertyPnlRange";
import { Banner, EmptyState, useRefresh, useTheme } from "@platform/mobile";
import { useState } from "react";
import { FlatList, Text, View } from "react-native";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import { PROPERTY_PNL_MESSAGES as MESSAGES } from "../../constants/propertyPnl";
import { useToday } from "../../lib/useToday";
import PickerField from "../transactions/PickerField";
import PropertyPnlCard from "./PropertyPnlCard";
import PropertyPnlPeriodSheet from "./PropertyPnlPeriodSheet";
import PropertyPnlSkeleton from "./PropertyPnlSkeleton";
import PropertyPnlTotals from "./PropertyPnlTotals";
import { periodDates, periodName } from "./propertyPnlDisplay";

export default function PropertyPnlScreen() {
  const { colors, spacing, fontSize } = useTheme();
  const today = useToday();
  const [range, setRange] = useState<PropertyPnLRange>(() => propertyPnlRange("this_month", new Date()));
  const [isChoosing, setIsChoosing] = useState(false);
  const { currentData, error, isFetching, refetch } = useGetPropertyPnlQuery(range);
  const { refresh, refreshControl } = useRefresh(async () => {
    await refetch();
  }, error);
  const properties = currentData?.properties ?? [];
  const dates = periodDates(range);

  // Loaded and empty is a real answer; no answer and nothing in flight is a failure.
  const emptyList = currentData ? (
    <EmptyState
      action={{ label: MESSAGES.showYearToDate, onPress: () => setRange(propertyPnlRange("ytd", today)) }}
      body={MESSAGES.noneBody}
      heading={MESSAGES.noneHeading}
    />
  ) : isFetching ? (
    <PropertyPnlSkeleton />
  ) : (
    <EmptyState action={{ label: MESSAGES.tryAgain, onPress: refresh }} body={MESSAGES.checkConnection} heading={MESSAGES.couldntLoad} />
  );

  return (
    <>
      <FlatList
        ListEmptyComponent={emptyList}
        ListHeaderComponent={
          <View style={{ gap: spacing.md, padding: spacing.lg }}>
            {error && currentData ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
            <PickerField hint={MESSAGES.periodHint} label={MESSAGES.period} onPress={() => setIsChoosing(true)} value={`${periodName(range, today)}, ${dates}`} />
            {currentData && properties.length > 0 ? <PropertyPnlTotals dates={dates} totals={currentData} /> : null}
            {currentData && properties.length > 0 ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.approvedOnly}</Text> : null}
          </View>
        }
        contentInsetAdjustmentBehavior="automatic"
        data={properties}
        keyExtractor={(entry) => entry.property_id}
        refreshControl={refreshControl}
        renderItem={({ item }) => <PropertyPnlCard entry={item} range={range} />}
        testID="property-pnl-list"
      />
      {isChoosing ? (
        <PropertyPnlPeriodSheet
          onApply={(chosen) => {
            setIsChoosing(false);
            setRange(chosen);
          }}
          onClose={() => setIsChoosing(false)}
          range={range}
          today={today}
        />
      ) : null}
    </>
  );
}
