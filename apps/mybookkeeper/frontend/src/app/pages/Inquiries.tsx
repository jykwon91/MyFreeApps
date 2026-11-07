import { useMemo, useState } from "react";
import { FileText, Plus } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import { LoadingButton } from "@platform/ui";
import { useGetInquiriesQuery } from "@mybookkeeper/api-client/store/inquiriesApi";
import { useGetListingsQuery } from "@mybookkeeper/api-client/store/listingsApi";
import { INQUIRY_STAGES } from "@mybookkeeper/api-client/constants/inquiryLabels";
import { INQUIRY_PAGE_SIZE } from "@mybookkeeper/api-client/constants/inquiryPaging";
import type { InquirySpamStatus } from "@mybookkeeper/api-client/types/inquiry/inquiry-spam-status";
import type { InquiryStage } from "@mybookkeeper/api-client/types/inquiry/inquiry-stage";
import InquiryStageFilter from "@/app/features/inquiries/InquiryStageFilter";
import InquirySpamTabFilter from "@/app/features/inquiries/InquirySpamTabFilter";
import InquiryForm from "@/app/features/inquiries/InquiryForm";
import { resolveListLoadMode } from "@/shared/lib/list-load-mode";
import InquiriesListBody from "@/app/features/inquiries/InquiriesListBody";
import { useCanWrite } from "@/shared/hooks/useOrgRole";
import LoadErrorAlert from "@/shared/components/ui/LoadErrorAlert";

const STAGE_PARAM = "stage";
const SPAM_PARAM = "spam";

const SPAM_STATUSES: ReadonlyArray<InquirySpamStatus> = [
  "unscored",
  "clean",
  "flagged",
  "spam",
  "manually_cleared",
];

function parseStageParam(value: string | null): InquiryStage | null {
  if (value === null) return null;
  return (INQUIRY_STAGES as readonly string[]).includes(value)
    ? (value as InquiryStage)
    : null;
}

// "Inbox" is the default tab when no spam param is present — it matches the
// most common operator workflow (review legitimate inquiries first).
const DEFAULT_SPAM_FILTER: InquirySpamStatus = "clean";

function parseSpamParam(value: string | null): InquirySpamStatus | null {
  if (value === null) return DEFAULT_SPAM_FILTER;
  if (value === "all") return null;
  return (SPAM_STATUSES as readonly string[]).includes(value)
    ? (value as InquirySpamStatus)
    : DEFAULT_SPAM_FILTER;
}

export default function Inquiries() {
  const [searchParams, setSearchParams] = useSearchParams();
  const stage = parseStageParam(searchParams.get(STAGE_PARAM));
  const spamFilter = parseSpamParam(searchParams.get(SPAM_PARAM));
  const [pageCount, setPageCount] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const canWrite = useCanWrite();

  const queryArgs = useMemo(
    () => ({
      ...(stage ? { stage } : {}),
      ...(spamFilter === DEFAULT_SPAM_FILTER
        ? { inbox_only: true }
        : spamFilter
          ? { spam_status: spamFilter }
          : {}),
      limit: INQUIRY_PAGE_SIZE * pageCount,
      offset: 0,
    }),
    [stage, spamFilter, pageCount],
  );

  const { data, isFetching, error, refetch } = useGetInquiriesQuery(queryArgs);
  const { data: listingsData } = useGetListingsQuery();

  const inquiries = data?.items ?? [];
  const hasMore = data?.has_more ?? false;

  // Memoize the listings array reference so the downstream useMemo deps
  // remain stable across renders when listingsData hasn't changed (the
  // ``?? []`` fallback otherwise produces a fresh array each render).
  const listings = useMemo(
    () => listingsData?.items ?? [],
    [listingsData],
  );

  const listingTitleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of listings) {
      map.set(l.id, l.title);
    }
    return map;
  }, [listings]);

  function handleFilterChange(next: InquiryStage | null) {
    const params = new URLSearchParams(searchParams);
    if (next) {
      params.set(STAGE_PARAM, next);
    } else {
      params.delete(STAGE_PARAM);
    }
    setSearchParams(params, { replace: true });
    setPageCount(1);
  }

  function handleSpamFilterChange(next: InquirySpamStatus | null) {
    const params = new URLSearchParams(searchParams);
    if (!next) {
      params.set(SPAM_PARAM, "all");
    } else if (next === DEFAULT_SPAM_FILTER) {
      // Default tab — drop the param so the URL stays clean.
      params.delete(SPAM_PARAM);
    } else {
      params.set(SPAM_PARAM, next);
    }
    setSearchParams(params, { replace: true });
    setPageCount(1);
  }

  function handleLoadMore() {
    setPageCount((prev) => prev + 1);
  }

  const showStageBadge = !stage;
  const isFiltered = !!stage;

  const mode = resolveListLoadMode({
    hasData: data !== undefined,
    hasError: error !== undefined,
    itemCount: inquiries.length,
  });

  return (
    <main className="p-4 sm:p-8 space-y-6">
      <SectionHeader
        title="Inquiries"
        subtitle="Travel nurses and other guests reaching out about your rooms."
        actions={
          <div className="flex items-center gap-2">
            <Link
              to="/reply-templates"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground min-h-[44px] px-3 border rounded-md"
              data-testid="manage-reply-templates-link"
            >
              <FileText className="h-4 w-4" aria-hidden="true" />
              Templates
            </Link>
            {canWrite ? (
              <LoadingButton
                onClick={() => setShowForm(true)}
                isLoading={false}
                data-testid="new-inquiry-button"
              >
                <Plus className="h-4 w-4 mr-1" />
                New inquiry
              </LoadingButton>
            ) : null}
          </div>
        }
      />

      <InquirySpamTabFilter value={spamFilter} onChange={handleSpamFilterChange} />

      <InquiryStageFilter value={stage} onChange={handleFilterChange} />

      {error ? (
        <LoadErrorAlert message="I couldn't load your inquiries. Want me to try again?" isRetrying={isFetching} onRetry={() => refetch()} />
      ) : null}

      <InquiriesListBody
        mode={mode}
        inquiries={inquiries}
        isFiltered={isFiltered}
        showStageBadge={showStageBadge}
        listingTitleById={listingTitleById}
        hasMore={hasMore}
        isFetching={isFetching}
        onLoadMore={handleLoadMore}
        canWrite={canWrite}
      />

      {showForm && canWrite ? (
        <InquiryForm
          listings={listings}
          onClose={() => setShowForm(false)}
        />
      ) : null}
    </main>
  );
}
