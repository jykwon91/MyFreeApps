import { useMemo, useState } from "react";
import { FileText, Plus } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import EmptyState from "@/shared/components/ui/EmptyState";
import AlertBox from "@/shared/components/ui/AlertBox";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import { useGetInquiriesQuery } from "@/shared/store/inquiriesApi";
import { useGetListingsQuery } from "@/shared/store/listingsApi";
import { INQUIRY_PAGE_SIZE, INQUIRY_STAGES } from "@/shared/lib/inquiry-labels";
import type { InquirySpamStatus } from "@/shared/types/inquiry/inquiry-spam-status";
import type { InquiryStage } from "@/shared/types/inquiry/inquiry-stage";
import InquiriesSkeleton from "@/app/features/inquiries/InquiriesSkeleton";
import InquiryStageFilter from "@/app/features/inquiries/InquiryStageFilter";
import InquirySpamTabFilter from "@/app/features/inquiries/InquirySpamTabFilter";
import InquiryCard from "@/app/features/inquiries/InquiryCard";
import InquiryRow from "@/app/features/inquiries/InquiryRow";
import InquiryForm from "@/app/features/inquiries/InquiryForm";

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

// "Clean" is the default tab when no spam param is present — it matches the
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

  const queryArgs = useMemo(
    () => ({
      ...(stage ? { stage } : {}),
      ...(spamFilter ? { spam_status: spamFilter } : {}),
      limit: INQUIRY_PAGE_SIZE * pageCount,
      offset: 0,
    }),
    [stage, spamFilter, pageCount],
  );

  const { data, isLoading, isFetching, isError, refetch } = useGetInquiriesQuery(queryArgs);
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
    if (next === null) {
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

  const showStageBadge = stage === null;

  const isFiltered = stage !== null;

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
            <LoadingButton
              onClick={() => setShowForm(true)}
              isLoading={false}
              data-testid="new-inquiry-button"
            >
              <Plus className="h-4 w-4 mr-1" />
              New inquiry
            </LoadingButton>
          </div>
        }
      />

      <InquirySpamTabFilter value={spamFilter} onChange={handleSpamFilterChange} />

      <InquiryStageFilter value={stage} onChange={handleFilterChange} />

      {isError ? (
        <AlertBox variant="error" className="flex items-center justify-between gap-3">
          <span>I couldn't load your inquiries. Want me to try again?</span>
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
        <InquiriesSkeleton />
      ) : inquiries.length === 0 && !isError ? (
        <EmptyState
          message={
            isFiltered
              ? "No inquiries in this stage. Try a different filter."
              : "No inquiries yet. They'll land here when guests reach out via Furnished Finder, TNH, or directly. Use \"New inquiry\" to log one manually."
          }
        />
      ) : (
        <>
          {/* Mobile: cards */}
          <ul className="md:hidden space-y-3" data-testid="inquiries-mobile">
            {inquiries.map((inquiry) => (
              <li key={inquiry.id}>
                <InquiryCard
                  inquiry={inquiry}
                  listingTitle={inquiry.listing_id ? listingTitleById.get(inquiry.listing_id) ?? null : null}
                  showStageBadge={showStageBadge}
                />
              </li>
            ))}
          </ul>

          {/* Desktop: table */}
          <div
            className="hidden md:block border rounded-lg overflow-hidden"
            data-testid="inquiries-desktop"
          >
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Inquirer</th>
                  <th className="px-4 py-2 font-medium">Source</th>
                  <th className="px-4 py-2 font-medium">Desired Dates</th>
                  <th className="px-4 py-2 font-medium">Employer</th>
                  <th className="px-4 py-2 font-medium">Listing</th>
                  <th className="px-4 py-2 font-medium">Received</th>
                  <th className="px-4 py-2 font-medium">Stage</th>
                  <th className="px-4 py-2 font-medium">Quality</th>
                </tr>
              </thead>
              <tbody>
                {inquiries.map((inquiry) => (
                  <InquiryRow
                    key={inquiry.id}
                    inquiry={inquiry}
                    listingTitle={inquiry.listing_id ? listingTitleById.get(inquiry.listing_id) ?? null : null}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {hasMore ? (
            <div className="flex justify-center">
              <LoadingButton
                variant="secondary"
                onClick={handleLoadMore}
                isLoading={isFetching}
                loadingText="Loading..."
              >
                Load more
              </LoadingButton>
            </div>
          ) : null}
        </>
      )}

      {showForm ? (
        <InquiryForm
          listings={listings}
          onClose={() => setShowForm(false)}
        />
      ) : null}
    </main>
  );
}
