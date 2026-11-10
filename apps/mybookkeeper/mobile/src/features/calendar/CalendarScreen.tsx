import { useGetCalendarEventsQuery, useGetReviewQueueCountQuery } from "@mybookkeeper/api-client/store/calendarApi";
import { useGetListingsQuery } from "@mybookkeeper/api-client/store/listingsApi";
import { useGetPropertiesQuery } from "@mybookkeeper/api-client/store/propertiesApi";
import type { CalendarEvent } from "@mybookkeeper/api-client/types/calendar/calendar-event";
import { Banner, LoadingButton, SHOWING_LAST_LOADED_MESSAGE, useAnnouncement, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { SectionList, View } from "react-native";
import { CALENDAR_LISTINGS_CHECK, CALENDAR_MESSAGES } from "../../constants/calendar";
import { FILTER_MESSAGES } from "../../constants/calendarFilters";
import { isoFromDate, monthOf, shiftMonth } from "../../lib/localDate";
import { useToday } from "../../lib/useToday";
import type { CalendarFilters } from "../../types/CalendarFilters";
import type { CalendarSection } from "../../types/CalendarSection";
import { bookingCount, calendarSections, monthTitle, reviewQueueMessage, sectionToOpenAt } from "./calendarDisplay";
import { filterSummary, hasCalendarFilters, NO_CALENDAR_FILTERS, withKnownProperties } from "./calendarFilters";
import CalendarEmptyList from "./CalendarEmptyList";
import CalendarEventRow from "./CalendarEventRow";
import CalendarEventSheet from "./CalendarEventSheet";
import CalendarFilterSheet from "./CalendarFilterSheet";
import CalendarJumpSheet from "./CalendarJumpSheet";
import CalendarLastSynced from "./CalendarLastSynced";
import CalendarMonthNav from "./CalendarMonthNav";
import CalendarSectionHeader from "./CalendarSectionHeader";
import { useOpenAtSection } from "./useOpenAtSection";

export default function CalendarScreen() {
  const { spacing } = useTheme();
  const todayDate = useToday();
  const today = isoFromDate(todayDate);
  const thisMonth = monthOf(todayDate);
  const [month, setMonth] = useState(thisMonth);
  const [hasChangedMonth, setHasChangedMonth] = useState(false);
  const [chosenFilters, setChosenFilters] = useState<CalendarFilters>(NO_CALENDAR_FILTERS);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isJumpOpen, setIsJumpOpen] = useState(false);
  const [shownEvent, setShownEvent] = useState<CalendarEvent | null>(null);
  const [isEventOpen, setIsEventOpen] = useState(false);
  const leaseToOpen = useRef<string | null>(null);
  const list = useRef<SectionList<CalendarEvent, CalendarSection>>(null);

  const { data: properties = [] } = useGetPropertiesQuery();
  const filters = useMemo(() => withKnownProperties(chosenFilters, properties.map((property) => property.id)), [chosenFilters, properties]);
  const { currentData, error, isFetching, refetch } = useGetCalendarEventsQuery({
    from: month,
    to: shiftMonth(month, 1),
    property_ids: filters.propertyIds,
    sources: filters.sources,
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

  const filterLabel = filterSummary(filters, properties);
  const hasFilters = hasCalendarFilters(filters);
  // The list refreshes after notes or files change, and the open sheet should show the new booking, not the one tapped.
  const openEvent = (shownEvent && currentData?.find((event) => event.id === shownEvent.id && event.source === shownEvent.source)) ?? shownEvent;

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
            hasFilters={hasFilters}
            hasNoListings={listings?.total === 0}
            isLoading={isFetching && !currentData}
            month={month}
            onClearFilters={() => setChosenFilters(NO_CALENDAR_FILTERS)}
            onRetry={refresh}
          />
        }
        ListHeaderComponent={
          <View style={{ gap: spacing.md, padding: spacing.lg }}>
            <CalendarMonthNav
              isThisMonth={month === thisMonth}
              month={month}
              onChange={changeMonth}
              onJump={() => setIsJumpOpen(true)}
              onToday={() => changeMonth(thisMonth)}
            />
            <CalendarLastSynced events={currentData ?? []} />
            {reviewCount > 0 ? (
              <Banner
                actions={[{ label: CALENDAR_MESSAGES.reviewBookings, onPress: () => router.push("/calendar/review") }]}
                message={reviewQueueMessage(reviewCount)}
                tone="success"
              />
            ) : (
              <LoadingButton onPress={() => router.push("/calendar/review")} variant="ghost">
                {CALENDAR_MESSAGES.reviewQueue}
              </LoadingButton>
            )}
            {error && currentData ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
            <LoadingButton
              accessibilityLabel={`${FILTER_MESSAGES.button}, currently ${hasFilters ? filterLabel : "none"}`}
              onPress={() => setIsFilterOpen(true)}
              variant="secondary"
            >
              {filterLabel}
            </LoadingButton>
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
      <CalendarFilterSheet
        filters={filters}
        isOpen={isFilterOpen}
        onChange={setChosenFilters}
        onClose={() => setIsFilterOpen(false)}
        properties={properties}
      />
      <CalendarJumpSheet isOpen={isJumpOpen} month={month} onClose={() => setIsJumpOpen(false)} onJump={changeMonth} thisMonth={thisMonth} />
      <CalendarEventSheet
        event={openEvent}
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
