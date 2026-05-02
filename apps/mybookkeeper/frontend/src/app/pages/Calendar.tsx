import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import EmptyState from "@/shared/components/ui/EmptyState";
import AlertBox from "@/shared/components/ui/AlertBox";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import PropertyMultiSelect from "@/shared/components/PropertyMultiSelect";
import { useGetCalendarEventsQuery } from "@/shared/store/calendarApi";
import { useGetPropertiesQuery } from "@/shared/store/propertiesApi";
import { useGetListingsQuery } from "@/shared/store/listingsApi";
import {
  CALENDAR_DEFAULT_WINDOW_DAYS,
} from "@/shared/lib/calendar-constants";
import {
  addDays,
  formatIsoDate,
} from "@/app/features/calendar/calendar-utils";
import CalendarSkeleton from "@/app/features/calendar/CalendarSkeleton";
import CalendarGrid from "@/app/features/calendar/CalendarGrid";
import CalendarAgendaList from "@/app/features/calendar/CalendarAgendaList";
import CalendarLegend from "@/app/features/calendar/CalendarLegend";
import CalendarSourceFilter from "@/app/features/calendar/CalendarSourceFilter";
import CalendarWindowNav from "@/app/features/calendar/CalendarWindowNav";
import CalendarLastSynced from "@/app/features/calendar/CalendarLastSynced";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function todayIso(): string {
  return formatIsoDate(new Date());
}

function parseIsoOrNull(value: string | null): string | null {
  if (!value || !ISO_DATE_PATTERN.test(value)) return null;
  return value;
}

function parseCsvOrEmpty(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function Calendar() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Resolve the current window from URL, defaulting to today → today + 30.
  const fromIso = parseIsoOrNull(searchParams.get("from")) ?? todayIso();
  const toIso =
    parseIsoOrNull(searchParams.get("to")) ?? addDays(fromIso, CALENDAR_DEFAULT_WINDOW_DAYS);

  const selectedPropertyIds = parseCsvOrEmpty(searchParams.get("properties"));
  const selectedSources = parseCsvOrEmpty(searchParams.get("sources"));

  const queryArgs = useMemo(
    () => ({
      from: fromIso,
      to: toIso,
      property_ids: selectedPropertyIds,
      sources: selectedSources,
    }),
    [fromIso, toIso, selectedPropertyIds, selectedSources],
  );

  const {
    data: events,
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useGetCalendarEventsQuery(queryArgs);
  const { data: properties = [] } = useGetPropertiesQuery();
  const { data: listingsEnvelope } = useGetListingsQuery({ limit: 100, offset: 0 });

  const hasNoListings = (listingsEnvelope?.total ?? 0) === 0;

  function updateWindow(nextFrom: string, nextTo: string) {
    const params = new URLSearchParams(searchParams);
    params.set("from", nextFrom);
    params.set("to", nextTo);
    setSearchParams(params, { replace: true });
  }

  function handleToday() {
    const today = todayIso();
    updateWindow(today, addDays(today, CALENDAR_DEFAULT_WINDOW_DAYS));
  }

  function handlePropertiesChange(ids: string[]) {
    const params = new URLSearchParams(searchParams);
    if (ids.length === 0) {
      params.delete("properties");
    } else {
      params.set("properties", ids.join(","));
    }
    setSearchParams(params, { replace: true });
  }

  function handleSourcesChange(sources: string[]) {
    const params = new URLSearchParams(searchParams);
    if (sources.length === 0) {
      params.delete("sources");
    } else {
      params.set("sources", sources.join(","));
    }
    setSearchParams(params, { replace: true });
  }

  const eventsList = events ?? [];
  const isEmpty = !isLoading && !isError && eventsList.length === 0;

  return (
    <main className="p-4 sm:p-8 space-y-6">
      <SectionHeader
        title="Calendar"
        subtitle="Every booking across every channel and listing, in one view."
        actions={<CalendarLastSynced events={eventsList} />}
      />

      <div className="flex flex-wrap items-center gap-3">
        <CalendarWindowNav
          fromIso={fromIso}
          toIso={toIso}
          onChange={updateWindow}
          onToday={handleToday}
        />
        <PropertyMultiSelect
          properties={properties}
          selectedIds={selectedPropertyIds}
          onChange={handlePropertiesChange}
        />
        <CalendarSourceFilter
          selectedSources={selectedSources}
          onChange={handleSourcesChange}
        />
        <div className="ml-auto">
          <CalendarLegend />
        </div>
      </div>

      {isError ? (
        <AlertBox variant="error" className="flex items-center justify-between gap-3">
          <span>I couldn't load the calendar. Want me to try again?</span>
          <LoadingButton
            variant="secondary"
            size="sm"
            isLoading={isFetching}
            loadingText="Retrying..."
            onClick={() => refetch()}
          >
            Retry
          </LoadingButton>
        </AlertBox>
      ) : null}

      {isLoading ? (
        <CalendarSkeleton />
      ) : hasNoListings ? (
        <div
          className="text-center text-muted-foreground text-sm py-8"
          data-testid="calendar-no-listings"
        >
          <p>You don't have any listings yet.</p>
          <Link
            to="/listings"
            className="mt-2 inline-block text-sm font-medium text-primary hover:underline"
          >
            Add a listing to start tracking bookings here
          </Link>
        </div>
      ) : isEmpty ? (
        <EmptyState message="No bookings in this window. Try a different date range, or check that channel sync is wired up under Listings → Channels." />
      ) : (
        <>
          <div className="hidden md:block" data-testid="calendar-desktop">
            <CalendarGrid events={eventsList} fromIso={fromIso} toIso={toIso} />
          </div>
          <div className="md:hidden" data-testid="calendar-mobile">
            <CalendarAgendaList events={eventsList} />
          </div>
        </>
      )}
    </main>
  );
}
