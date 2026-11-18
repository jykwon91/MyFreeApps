/**
 * Unit tests for ApplicantPicker: the lease applicant picker pages through the
 * approved and lease_sent stages, fetched by stage from the server.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ApplicantPicker from "@/app/features/leases/ApplicantPicker";
import type { ApplicantSummary } from "@mybookkeeper/api-client/types/applicant/applicant-summary";
import type { ApplicantStage } from "@mybookkeeper/api-client/types/applicant/applicant-stage";
import { queryStatus } from "@/test/rtk-query-status";
import { queryData } from "@/test/rtk-query-data";

const mockUseListApplicantPagesInfiniteQuery = vi.fn();

vi.mock("@mybookkeeper/api-client/store/applicantsApi", () => ({
  useListApplicantPagesInfiniteQuery: (args: unknown) => mockUseListApplicantPagesInfiniteQuery(args),
}));

function applicant(id: string, name: string, stage: ApplicantStage): ApplicantSummary {
  return {
    id,
    organization_id: "org-1",
    user_id: "u1",
    inquiry_id: null,
    legal_name: name,
    employer_or_hospital: null,
    contract_start: null,
    contract_end: null,
    stage,
    tenant_ended_at: null,
    tenant_ended_reason: null,
    created_at: "2026-05-01T00:00:00Z",
    updated_at: "2026-05-01T00:00:00Z",
  };
}

const APPROVED_1 = applicant("app-approved", "Jane Approved", "approved");
const APPROVED_PAGE_2 = applicant("app-approved-late", "Zed Approved Late", "approved");
const LEASE_SENT_1 = applicant("app-lease-sent", "Bob Lease Sent", "lease_sent");

interface StageQueryOptions {
  pages?: ApplicantSummary[][];
  hasNextPage?: boolean;
  failed?: boolean;
  fetching?: boolean;
  isFetchingNextPage?: boolean;
  fetchNextPage?: ReturnType<typeof vi.fn>;
  refetch?: ReturnType<typeof vi.fn>;
}

function stageQuery({
  pages = [[]],
  hasNextPage = false,
  failed = false,
  fetching = false,
  isFetchingNextPage = false,
  fetchNextPage = vi.fn(),
  refetch = vi.fn(),
}: StageQueryOptions = {}) {
  const loaded = pages.length > 0 ? queryData({ pages: pages.map((items) => ({ items, total: items.length, has_more: hasNextPage })) }) : queryData(undefined);
  return { ...loaded, ...queryStatus({ failed, fetching }), hasNextPage, isFetchingNextPage, fetchNextPage, refetch };
}

type Stage = "approved" | "lease_sent";
let stages: Record<Stage, ReturnType<typeof stageQuery>>;

function showStages(next: Record<Stage, ReturnType<typeof stageQuery>>) {
  stages = next;
}

function Picker({ onSelect }: { onSelect: (a: ApplicantSummary) => void }) {
  return <ApplicantPicker selectedId={null} onSelect={onSelect} />;
}

describe("ApplicantPicker", () => {
  beforeEach(() => {
    mockUseListApplicantPagesInfiniteQuery.mockReset();
    mockUseListApplicantPagesInfiniteQuery.mockImplementation(({ stage }: { stage: Stage }) => stages[stage]);
  });

  it("asks the server for the approved and lease_sent stages, one per request", () => {
    showStages({ approved: stageQuery({ pages: [[APPROVED_1]] }), lease_sent: stageQuery({ pages: [[LEASE_SENT_1]] }) });
    render(<Picker onSelect={vi.fn()} />);
    expect(mockUseListApplicantPagesInfiniteQuery).toHaveBeenCalledWith({ stage: "approved" });
    expect(mockUseListApplicantPagesInfiniteQuery).toHaveBeenCalledWith({ stage: "lease_sent" });
  });

  it("lists applicants from both stages and calls onSelect", async () => {
    const onSelect = vi.fn();
    showStages({ approved: stageQuery({ pages: [[APPROVED_1]] }), lease_sent: stageQuery({ pages: [[LEASE_SENT_1]] }) });
    render(<Picker onSelect={onSelect} />);
    expect(screen.getByTestId("applicant-option-app-lease-sent")).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("applicant-option-app-approved"));
    expect(onSelect).toHaveBeenCalledWith(APPROVED_1);
    expect(screen.queryByTestId("applicant-picker-load-more")).not.toBeInTheDocument();
  });

  it("shows the empty message when neither stage has anyone", () => {
    showStages({ approved: stageQuery(), lease_sent: stageQuery() });
    render(<Picker onSelect={vi.fn()} />);
    expect(screen.getByTestId("applicant-picker-empty")).toBeInTheDocument();
  });

  it("shows the skeleton while a stage's first page is loading, not the empty message", () => {
    showStages({ approved: stageQuery({ pages: [[APPROVED_1]] }), lease_sent: stageQuery({ pages: [], fetching: true }) });
    render(<Picker onSelect={vi.fn()} />);
    expect(screen.getByTestId("applicant-picker-skeleton")).toBeInTheDocument();
    expect(screen.queryByTestId("applicant-picker-empty")).not.toBeInTheDocument();
  });

  it("loads the next page only for stages that have more, and an applicant from page 2 can be picked", async () => {
    const onSelect = vi.fn();
    const approvedFetch = vi.fn().mockResolvedValue({ isError: false });
    const leaseSentFetch = vi.fn();
    showStages({
      approved: stageQuery({ pages: [[APPROVED_1]], hasNextPage: true, fetchNextPage: approvedFetch }),
      lease_sent: stageQuery({ pages: [[LEASE_SENT_1]], fetchNextPage: leaseSentFetch }),
    });
    const { rerender } = render(<Picker onSelect={onSelect} />);
    expect(screen.queryByTestId("applicant-option-app-approved-late")).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId("applicant-picker-load-more"));
    expect(approvedFetch).toHaveBeenCalledTimes(1);
    expect(leaseSentFetch).not.toHaveBeenCalled();

    showStages({ approved: stageQuery({ pages: [[APPROVED_1], [APPROVED_PAGE_2]] }), lease_sent: stages.lease_sent });
    rerender(<Picker onSelect={onSelect} />);
    await userEvent.click(screen.getByTestId("applicant-option-app-approved-late"));
    expect(onSelect).toHaveBeenCalledWith(APPROVED_PAGE_2);
    expect(screen.getByTestId("applicant-option-app-approved")).toBeInTheDocument();
    expect(screen.queryByTestId("applicant-picker-load-more")).not.toBeInTheDocument();
  });

  it("disables Load more and shows its loading text while the next page loads", () => {
    showStages({
      approved: stageQuery({ pages: [[APPROVED_1]], hasNextPage: true, fetching: true, isFetchingNextPage: true }),
      lease_sent: stageQuery({ pages: [[LEASE_SENT_1]] }),
    });
    render(<Picker onSelect={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Loading..." })).toBeDisabled();
    expect(screen.getByTestId("applicant-option-app-approved")).toBeInTheDocument();
  });

  it("keeps loaded applicants when Load more fails, and Retry fetches again only the failed stage", async () => {
    const approvedFetch = vi.fn().mockResolvedValueOnce({ isError: true }).mockResolvedValueOnce({ isError: false });
    const leaseSentFetch = vi.fn().mockResolvedValue({ isError: false });
    const loaded = {
      approved: stageQuery({ pages: [[APPROVED_1]], hasNextPage: true, fetchNextPage: approvedFetch }),
      lease_sent: stageQuery({ pages: [[LEASE_SENT_1]], hasNextPage: true, fetchNextPage: leaseSentFetch }),
    };
    showStages(loaded);
    const { rerender } = render(<Picker onSelect={vi.fn()} />);
    await userEvent.click(screen.getByTestId("applicant-picker-load-more"));
    expect(leaseSentFetch).toHaveBeenCalledTimes(1);

    showStages({ ...loaded, approved: stageQuery({ pages: [[APPROVED_1]], hasNextPage: true, failed: true, fetchNextPage: approvedFetch }) });
    rerender(<Picker onSelect={vi.fn()} />);
    expect(screen.getByText(/couldn't load more applicants/i)).toBeInTheDocument();
    expect(screen.getByTestId("applicant-option-app-approved")).toBeInTheDocument();
    expect(screen.getByTestId("applicant-option-app-lease-sent")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(approvedFetch).toHaveBeenCalledTimes(2);
    expect(leaseSentFetch).toHaveBeenCalledTimes(1);

    showStages(loaded);
    rerender(<Picker onSelect={vi.fn()} />);
    expect(screen.queryByText(/couldn't load more applicants/i)).not.toBeInTheDocument();
  });

  it("shows the error with Retry when the first page fails, and Retry refetches the failed stage", async () => {
    const refetch = vi.fn().mockResolvedValue({});
    showStages({
      approved: stageQuery({ pages: [], failed: true, refetch }),
      lease_sent: stageQuery({ pages: [[LEASE_SENT_1]] }),
    });
    render(<Picker onSelect={vi.fn()} />);
    expect(screen.getByText(/couldn't load your applicants/i)).toBeInTheDocument();
    expect(screen.queryByTestId("applicant-picker-empty")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("keeps the error, not the empty message, while Retry refetches", () => {
    showStages({
      approved: stageQuery({ pages: [], failed: true, fetching: true }),
      lease_sent: stageQuery(),
    });
    render(<Picker onSelect={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Retrying..." })).toBeDisabled();
    expect(screen.queryByTestId("applicant-picker-empty")).not.toBeInTheDocument();
  });
});
