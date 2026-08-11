import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Inbox } from "lucide-react";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import EmptyState from "@/shared/components/ui/EmptyState";
import AlertBox from "@/shared/components/ui/AlertBox";
import { LoadingButton } from "@platform/ui";
import PropertyMultiSelect from "@/shared/components/PropertyMultiSelect";
import { useGetCalendarEventsQuery, useGetReviewQueueCountQuery } from "@/shared/store/calendarApi";
import { useGetPropertiesQuery } from "@/shared/store/propertiesApi";
import { useGetListingsQuery } from "@/shared/store/listingsApi";
import {
  CALENDAR_DEFAULT_WINDOW_DAYS,
  parseCalendarView,
} from "@/shared/lib/calendar-constants";
import {
  addDays,
  formatIsoDate,
} from "@/app/features/calendar/calendar-utils";
import {
  monthGridWindow,
  startOfMonth,
} from "@/app/features/calendar/month-grid-utils";
import CalendarLoadingState from "@/app/features/calendar/CalendarLoadingState";
import CalendarViewport from "@/app/features/calendar/CalendarViewport";
import CalendarAgendaList from "@/app/features/calendar/CalendarAgendaList";
import CalendarLegend from "@/app/features/calendar/CalendarLegend";
import CalendarSourceFilter from "@/app/features/calendar/CalendarSourceFilter";
import CalendarMonthNav from "@/app/features/calendar/CalendarMonthNav";
import CalendarWindowNav from "@/app/features/calendar/CalendarWindowNav";
import CalendarViewToggle from "@/app/features/calendar/CalendarViewToggle";
import CalendarLastSynced from "@/app/features/calendar/CalendarLastSynced";
import ReviewQueueDrawer from "@/app/features/calendar/ReviewQueueDrawer";
import type { CalendarView } from "@/shared/types/calendar/calendar-view";

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
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const { data: pendingCount = 0 } = useGetReviewQueueCountQuery();

  // `from` is the anchor in both views: the window start for the timeline,
  // the month to display for the month grid. The month view derives its own
  // fetch window (whole weeks around that month) and ignores `to`.
  const view = parseCalendarView(searchParams.get("view"));
  const anchorIso = parseIsoOrNull(searchParams.get("from")) ?? todayIso();
  const timelineToIso =
    parseIsoOrNull(searchParams.get("to")) ?? addDays(anchorIso, CALENDAR_DEFAULT_WINDOW_DAYS);

  const monthWindow = monthGridWindow(anchorIso);
  const fromIso = view === "month" ? monthWindow.fromIso : anchorIso;
  const toIso = view === "month" ? monthWindow.toIso : timelineToIso;

  // Memoize the filter arrays so the query cache key stays referentially
  // stable across renders that don't change the URL — without this, the
  // `useMemo` below sees fresh arrays each render and would re-fetch on
  // every single re-render.
  const propertiesParam = searchParams.get("properties");
  const sourcesParam = searchParams.get("sources");
  const selectedPropertyIds = useMemo(
    () => parseCsvOrEmpty(propertiesParam),
    [propertiesParam],
  );
  const selectedSources = useMemo(
    () => parseCsvOrEmpty(sourcesParam),
    [sourcesParam],
  );

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

  /** Month view: `from` is the anchor month and `to` doesn't apply. */
  function updateAnchorMonth(nextAnchorIso: string) {
    const params = new URLSearchParams(searchParams);
    params.set("from", startOfMonth(nextAnchorIso));
    params.delete("to");
    setSearchParams(params, { replace: true });
  }

  function handleToday() {
    const today = todayIso();
    if (view === "month") {
      updateAnchorMonth(today);
      return;
    }
    updateWindow(today, addDays(today, CALENDAR_DEFAULT_WINDOW_DAYS));
  }

  function handleViewChange(nextView: CalendarView) {
    const params = new URLSearchParams(searchParams);
    params.set("view", nextView);
    if (nextView === "month") {
      // Land on the month the operator was already looking at.
      params.set("from", startOfMonth(anchorIso));
      params.delete("to");
    } else {
      // Open the timeline on the same date, at its own default width.
      params.set("from", anchorIso);
      params.set("to", addDays(anchorIso, CALENDAR_DEFAULT_WINDOW_DAYS));
    }
    setSearchParams(params, { replace: true });
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
        actions={
          <div className="flex items-center gap-3">
            <CalendarLastSynced events={eventsList} />
            <button
              type="button"
              onClick={() => setIsQueueOpen(true)}
              className="relative inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 min-h-[44px]"
              aria-label={
                pendingCount > 0
                  ? `Review queue — ${pendingCount} pending`
                  : "Review queue"
              }
              data-testid="review-queue-badge-btn"
            >
              <Inbox className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Review queue</span>
              {pendingCount > 0 && (
                <span
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white"
                  aria-hidden="true"
                  data-testid="review-queue-badge-count"
                >
                  {pendingCount > 99 ? "99+" : pendingCount}
                </span>
              )}
            </button>
          </div>
        }
      />

      <ReviewQueueDrawer isOpen={isQueueOpen} onClose={() => setIsQueueOpen(false)} />

      <div className="flex flex-wrap items-center gap-3">
        {view === "month" ? (
          <CalendarMonthNav
            anchorIso={anchorIso}
            onChange={updateAnchorMonth}
            onToday={handleToday}
          />
        ) : (
          <CalendarWindowNav
            fromIso={fromIso}
            toIso={toIso}
            onChange={updateWindow}
            onToday={handleToday}
          />
        )}
        <CalendarViewToggle view={view} onChange={handleViewChange} />
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
        <CalendarLoadingState view={view} />
      ) : hasNoListings && isEmpty ? (
        // A tenancy can exist with no listing behind it, so "no listings" is
        // only the right story when there's also nothing to show. Otherwise
        // this prompt would hide the very events it claims don't exist.
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
            <CalendarViewport
              view={view}
              events={eventsList}
              fromIso={fromIso}
              toIso={toIso}
              anchorIso={anchorIso}
              todayIso={todayIso()}
            />
          </div>
          <div className="md:hidden" data-testid="calendar-mobile">
            <CalendarAgendaList events={eventsList} />
          </div>
        </>
      )}
    </main>
  );
}
