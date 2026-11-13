import { useMemo, useState } from "react";
import { Inbox } from "lucide-react";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import PropertyMultiSelect from "@/shared/components/PropertyMultiSelect";
import { useGetCalendarEventsQuery, useGetReviewQueueCountQuery } from "@mybookkeeper/api-client/store/calendarApi";
import { useGetPropertiesQuery } from "@mybookkeeper/api-client/store/propertiesApi";
import { useGetListingsQuery } from "@mybookkeeper/api-client/store/listingsApi";
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
import CalendarBody from "@/app/features/calendar/CalendarBody";
import CalendarLegend from "@/app/features/calendar/CalendarLegend";
import CalendarSourceFilter from "@/app/features/calendar/CalendarSourceFilter";
import CalendarMonthNav from "@/app/features/calendar/CalendarMonthNav";
import CalendarWindowNav from "@/app/features/calendar/CalendarWindowNav";
import CalendarViewToggle from "@/app/features/calendar/CalendarViewToggle";
import CalendarLastSynced from "@/app/features/calendar/CalendarLastSynced";
import ReviewQueueDrawer from "@/app/features/calendar/ReviewQueueDrawer";
import type { CalendarView } from "@/shared/types/calendar/calendar-view";
import LoadErrorAlert from "@/shared/components/ui/LoadErrorAlert";
import { resolveListLoadMode } from "@/shared/lib/list-load-mode";
import { useLiveSearchParams } from "@platform/ui";

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
  const [searchParams, setSearchParams] = useLiveSearchParams();
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
    error,
    isFetching,
    refetch,
  } = useGetCalendarEventsQuery(queryArgs);
  const { data: properties = [] } = useGetPropertiesQuery();
  const { data: listingsEnvelope } = useGetListingsQuery({ limit: 100, offset: 0 });

  const hasNoListings = (listingsEnvelope?.total ?? 0) === 0;

  function updateWindow(nextFrom: string, nextTo: string) {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.set("from", nextFrom);
        params.set("to", nextTo);
        return params;
      },
      { replace: true },
    );
  }

  /** Month view: `from` is the anchor month and `to` doesn't apply. */
  function updateAnchorMonth(nextAnchorIso: string) {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.set("from", startOfMonth(nextAnchorIso));
        params.delete("to");
        return params;
      },
      { replace: true },
    );
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
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
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
        return params;
      },
      { replace: true },
    );
  }

  function handlePropertiesChange(ids: string[]) {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (ids.length === 0) {
          params.delete("properties");
        } else {
          params.set("properties", ids.join(","));
        }
        return params;
      },
      { replace: true },
    );
  }

  function handleSourcesChange(sources: string[]) {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (sources.length === 0) {
          params.delete("sources");
        } else {
          params.set("sources", sources.join(","));
        }
        return params;
      },
      { replace: true },
    );
  }

  const eventsList = events ?? [];
  const mode = resolveListLoadMode({
    hasData: events !== undefined,
    hasError: error !== undefined,
    itemCount: eventsList.length,
  });

  return (
    <div className="p-4 sm:p-8 space-y-6">
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

      {error ? (
        <LoadErrorAlert message="I couldn't load the calendar. Want me to try again?" isRetrying={isFetching} onRetry={() => refetch()} />
      ) : null}

      <CalendarBody
        mode={mode}
        hasNoListings={hasNoListings}
        view={view}
        events={eventsList}
        fromIso={fromIso}
        toIso={toIso}
        anchorIso={anchorIso}
        todayIso={todayIso()}
      />
    </div>
  );
}
