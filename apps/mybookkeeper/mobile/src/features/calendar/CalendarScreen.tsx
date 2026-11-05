import { useGetCalendarEventsQuery, useGetReviewQueueCountQuery } from "@mybookkeeper/api-client/store/calendarApi";
import { useGetListingsQuery } from "@mybookkeeper/api-client/store/listingsApi";
import { useGetPropertiesQuery } from "@mybookkeeper/api-client/store/propertiesApi";
import type { CalendarEvent } from "@mybookkeeper/api-client/types/calendar/calendar-event";
import { Banner, LoadingButton, OptionSheet, useAnnouncement, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { SectionList, View } from "react-native";
import { WEB_BASE_URL } from "../../constants/api";
import { CALENDAR_ALL_PROPERTIES, CALENDAR_LISTINGS_CHECK, CALENDAR_MESSAGES } from "../../constants/calendar";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import { isoFromDate, monthOf, shiftMonth } from "../../lib/localDate";
import { useToday } from "../../lib/useToday";
import type { CalendarSection } from "../../types/CalendarSection";
import { useOpenLink } from "../inquiries/useOpenLink";
import { bookingCount, calendarSections, monthTitle, reviewQueueMessage, sectionToOpenAt } from "./calendarDisplay";
import CalendarEmptyList from "./CalendarEmptyList";
import CalendarEventRow from "./CalendarEventRow";
import CalendarEventSheet from "./CalendarEventSheet";
import CalendarMonthNav from "./CalendarMonthNav";
import CalendarSectionHeader from "./CalendarSectionHeader";
import { useOpenAtSection } from "./useOpenAtSection";

export default function CalendarScreen() {
  const { spacing } = useTheme();
  const openLink = useOpenLink();
  const todayDate = useToday();
  const today = isoFromDate(todayDate);
  const thisMonth = monthOf(todayDate);
  const [month, setMonth] = useState(thisMonth);
  const [hasChangedMonth, setHasChangedMonth] = useState(false);
  const [chosenPropertyId, setChosenPropertyId] = useState(CALENDAR_ALL_PROPERTIES);
  const [isPropertySheetOpen, setIsPropertySheetOpen] = useState(false);
  const [shownEvent, setShownEvent] = useState<CalendarEvent | null>(null);
  const [isEventOpen, setIsEventOpen] = useState(false);
  const leaseToOpen = useRef<string | null>(null);
  const list = useRef<SectionList<CalendarEvent, CalendarSection>>(null);

  const { data: properties = [] } = useGetPropertiesQuery();
  // A property that's gone can't stay chosen: its filter button goes with it, leaving no way out.
  const propertyId = properties.some((property) => property.id === chosenPropertyId) ? chosenPropertyId : CALENDAR_ALL_PROPERTIES;
  const { currentData, error, isFetching, refetch } = useGetCalendarEventsQuery({
    from: month,
    to: shiftMonth(month, 1),
    property_ids: propertyId === CALENDAR_ALL_PROPERTIES ? [] : [propertyId],
  });
  const { refresh, refreshControl } = useRefresh(async () => {
    await refetch();
  }, error);
  const { data: listings } = useGetListingsQuery(CALENDAR_LISTINGS_CHECK);
  const { data: reviewCount = 0 } = useGetReviewQueueCountQuery();

  const sections = useMemo(() => calendarSections(currentData ?? [], month, today), [currentData, month, today]);
  const rowCount = currentData?.length ?? 0;
  const hasFailed = Boolean(error) && !currentData;

  const monthResult = hasFailed ? CALENDAR_MESSAGES.couldntLoad : `${monthTitle(month)}, ${bookingCount(rowCount)}`;
  useAnnouncement(hasChangedMonth && (currentData || hasFailed) ? monthResult : undefined);

  const onScrollFailed = useOpenAtSection(list, currentData && month === thisMonth ? month : null, sectionToOpenAt(sections, today));

  function changeMonth(next: string): void {
    setHasChangedMonth(true);
    setMonth(next);
  }

  const propertyOptions = useMemo(
    () => [{ value: CALENDAR_ALL_PROPERTIES, label: CALENDAR_MESSAGES.allProperties }, ...properties.map((property) => ({ value: property.id, label: property.name }))],
    [properties],
  );
  const propertyLabel = propertyOptions.find((option) => option.value === propertyId)?.label ?? CALENDAR_MESSAGES.allProperties;

  const openLeaseAfterClosing = useCallback(() => {
    const leaseId = leaseToOpen.current;
    leaseToOpen.current = null;
    if (leaseId) router.push(`/leases/${leaseId}`);
  }, []);

  return (
    <>
      <SectionList
        ListEmptyComponent={
          <CalendarEmptyList
            hasFailed={hasFailed}
            hasNoListings={listings?.total === 0}
            isLoading={isFetching && !currentData}
            month={month}
            onRetry={refresh}
          />
        }
        ListHeaderComponent={
          <View style={{ gap: spacing.md, padding: spacing.lg }}>
            <CalendarMonthNav
              isThisMonth={month === thisMonth}
              month={month}
              onChange={changeMonth}
              onToday={() => changeMonth(thisMonth)}
            />
            {reviewCount > 0 ? (
              <Banner
                actions={[{ label: CALENDAR_MESSAGES.openWebsite, onPress: () => void openLink(`${WEB_BASE_URL}/calendar`) }]}
                message={reviewQueueMessage(reviewCount)}
                tone="success"
              />
            ) : null}
            {error && currentData ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
            {properties.length > 1 ? (
              <LoadingButton
                accessibilityLabel={`Filter by property, currently ${propertyLabel}`}
                onPress={() => setIsPropertySheetOpen(true)}
                variant="secondary"
              >
                {propertyLabel}
              </LoadingButton>
            ) : null}
          </View>
        }
        contentInsetAdjustmentBehavior="automatic"
        // A section also takes a header and a footer cell, and all of it has to exist to scroll to today.
        initialNumToRender={Math.max(rowCount + 2 * sections.length, 10)}
        keyExtractor={(event) => `${event.source}-${event.id}`}
        onScrollToIndexFailed={onScrollFailed}
        ref={list}
        refreshControl={refreshControl}
        renderItem={({ item }) => (
          <CalendarEventRow
            event={item}
            month={month}
            onPress={() => {
              setShownEvent(item);
              setIsEventOpen(true);
            }}
          />
        )}
        renderSectionHeader={({ section }) => <CalendarSectionHeader section={section} />}
        sections={sections}
        stickySectionHeadersEnabled={false}
      />
      <OptionSheet
        isOpen={isPropertySheetOpen}
        onClose={() => setIsPropertySheetOpen(false)}
        onSelect={(value) => {
          setChosenPropertyId(value);
          setIsPropertySheetOpen(false);
        }}
        options={propertyOptions}
        title={CALENDAR_MESSAGES.chooseProperty}
        value={propertyId}
      />
      <CalendarEventSheet
        event={shownEvent}
        isOpen={isEventOpen}
        onClose={() => setIsEventOpen(false)}
        onClosed={openLeaseAfterClosing}
        onOpenLease={(leaseId) => {
          leaseToOpen.current = leaseId;
          setIsEventOpen(false);
        }}
      />
    </>
  );
}
