/**
 * Against the real RTK Query hooks and a server stub that refuses a limit above its cap: every paged
 * list page loads past the cap one page at a time, starts over at the first page when its filter
 * changes, and keeps its rows through a failed "Load more", whose Retry asks for that page again.
 */
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Applicants from "@/app/pages/Applicants";
import Inquiries from "@/app/pages/Inquiries";
import Listings from "@/app/pages/Listings";
import Tenants from "@/app/pages/Tenants";
import Vendors from "@/app/pages/Vendors";
import type { ApplicantSummary } from "@mybookkeeper/api-client/types/applicant/applicant-summary";
import type { InquirySummary } from "@mybookkeeper/api-client/types/inquiry/inquiry-summary";
import type { ListingSummary } from "@mybookkeeper/api-client/types/listing/listing-summary";
import type { VendorSummary } from "@mybookkeeper/api-client/types/vendor/vendor-summary";
import { restoreApi, stubApi } from "@/test/api-stub";
import { answerListPage, SERVER_LIMIT_CAP } from "@/test/paged-list-server";
import { renderWithStore } from "@/test/render-with-store";

vi.mock("@/shared/hooks/useOrgRole", () => ({ useCanWrite: vi.fn(() => true) }));

const PAGE_SIZE = 25;
/** More rows than the server answers in one request, so reaching the last needs offset paging. */
const ROW_COUNT = SERVER_LIMIT_CAP + 30;
const CREATED = "2026-04-25T10:00:00Z";

function applicant(id: string, name: string): ApplicantSummary {
  return {
    id,
    organization_id: "org-1",
    user_id: "user-1",
    inquiry_id: null,
    legal_name: name,
    employer_or_hospital: null,
    contract_start: null,
    contract_end: null,
    stage: "lease_signed",
    tenant_ended_at: null,
    tenant_ended_reason: null,
    created_at: CREATED,
    updated_at: CREATED,
  };
}

function vendor(id: string, name: string): VendorSummary {
  return {
    id,
    organization_id: "org-1",
    user_id: "user-1",
    name,
    category: "plumber",
    phone: null,
    hourly_rate: null,
    preferred: false,
    last_used_at: null,
    created_at: CREATED,
    updated_at: CREATED,
  };
}

function inquiry(id: string, name: string): InquirySummary {
  return {
    id,
    source: "FF",
    listing_id: null,
    listing_title: null,
    stage: "new",
    inquirer_name: name,
    inquirer_employer: null,
    desired_start_date: null,
    desired_end_date: null,
    gut_rating: null,
    received_at: CREATED,
    spam_status: "clean",
    spam_score: null,
    submitted_via: "manual_entry",
    last_message_preview: null,
    last_message_at: null,
  };
}

function listing(id: string, name: string): ListingSummary {
  return {
    id,
    title: name,
    status: "active",
    room_type: "private_room",
    monthly_rate: "1000.00",
    property_id: "prop-1",
    created_at: CREATED,
    slug: null,
  };
}

interface PagedListCase {
  name: string;
  page: ReactElement;
  path: string;
  endpoint: string;
  noun: string;
  skeleton: string;
  row: (id: string, name: string) => { id: string };
  /** Whether a request is for the filter `changeFilter` picks. */
  isOtherFilter: (params: Readonly<Record<string, unknown>>) => boolean;
  changeFilter: () => Promise<void>;
}

const CASES: PagedListCase[] = [
  {
    name: "Applicants",
    page: <Applicants />,
    path: "/applicants",
    endpoint: "/applicants",
    noun: "applicants",
    skeleton: "applicants-skeleton",
    row: applicant,
    isOtherFilter: (params) => params.stage === "approved",
    changeFilter: () => userEvent.click(screen.getByTestId("applicant-filter-approved")),
  },
  {
    name: "Tenants",
    page: <Tenants />,
    path: "/tenants",
    endpoint: "/applicants/tenants",
    noun: "tenants",
    skeleton: "tenants-skeleton",
    row: applicant,
    isOtherFilter: (params) => String(params.include_ended) === "true",
    changeFilter: () => userEvent.click(screen.getByTestId("tenants-show-ended-toggle")),
  },
  {
    name: "Vendors",
    page: <Vendors />,
    path: "/vendors",
    endpoint: "/vendors",
    noun: "vendors",
    skeleton: "vendors-skeleton",
    row: vendor,
    isOtherFilter: (params) => params.category === "plumber",
    changeFilter: () => userEvent.click(screen.getByTestId("vendor-filter-plumber")),
  },
  {
    name: "Inquiries",
    page: <Inquiries />,
    path: "/inquiries",
    endpoint: "/inquiries",
    noun: "inquiries",
    skeleton: "inquiries-skeleton",
    row: inquiry,
    isOtherFilter: (params) => params.stage === "triaged",
    changeFilter: () => userEvent.click(screen.getByTestId("inquiry-filter-triaged")),
  },
  {
    name: "Listings",
    page: <Listings />,
    path: "/listings",
    endpoint: "/listings",
    noun: "listings",
    skeleton: "listings-skeleton",
    row: listing,
    isOtherFilter: (params) => params.status === "paused",
    changeFilter: () => userEvent.click(screen.getByTestId("listing-filter-paused")),
  },
];

/** `ROW_COUNT` rows named "<prefix> <n>". */
function rowsNamed(c: PagedListCase, prefix: string) {
  return Array.from({ length: ROW_COUNT }, (_, i) => c.row(`${prefix}-${i + 1}`, `${prefix} ${i + 1}`));
}

/** Answers everything but the list (the panels around it) with nothing. */
function answerOther(path: string): unknown {
  return path === "/properties" ? [] : { items: [], total: 0, has_more: false };
}

async function expectRow(name: string): Promise<void> {
  expect((await screen.findAllByText(name)).length).toBeGreaterThan(0);
}

async function clickLoadMore(): Promise<void> {
  await userEvent.click(screen.getAllByRole("button", { name: "Load more" })[0]);
}

let cleanup: () => void = () => undefined;

afterEach(() => {
  cleanup();
  restoreApi();
});

describe.each(CASES)("$name paging", (c) => {
  it("loads past the server's limit cap one page at a time, until the last row", async () => {
    const rows = rowsNamed(c, "Row");
    const requests: Array<Readonly<Record<string, unknown>>> = [];
    stubApi((path, params) => {
      if (path !== c.endpoint) return answerOther(path);
      requests.push(params);
      return answerListPage(rows, params);
    });
    cleanup = renderWithStore(c.page, c.path);
    await expectRow("Row 1");

    for (let shown = PAGE_SIZE; shown < ROW_COUNT; shown += PAGE_SIZE) {
      await clickLoadMore();
      await expectRow(`Row ${Math.min(shown + PAGE_SIZE, ROW_COUNT)}`);
    }

    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
    expect(screen.queryByText(new RegExp(`couldn't load`, "i"))).not.toBeInTheDocument();
    expect(requests.map((params) => Number(params.offset))).toEqual([0, 25, 50, 75, 100, 125]);
    expect(requests.every((params) => Number(params.limit) === PAGE_SIZE)).toBe(true);
  });

  it("starts over at the first page when the filter changes, never showing the previous filter's rows", async () => {
    const rows = rowsNamed(c, "Row");
    const otherRows = rowsNamed(c, "Other");
    const otherOffsets: number[] = [];
    stubApi((path, params) => {
      if (path !== c.endpoint) return answerOther(path);
      if (!c.isOtherFilter(params)) return answerListPage(rows, params);
      otherOffsets.push(Number(params.offset));
      return answerListPage(otherRows, params);
    });
    cleanup = renderWithStore(c.page, c.path);
    await expectRow("Row 1");
    await clickLoadMore();
    await expectRow(`Row ${PAGE_SIZE + 1}`);

    await c.changeFilter();

    await expectRow("Other 1");
    expect(screen.queryByText("Row 1")).not.toBeInTheDocument();
    expect(screen.queryByText(`Other ${PAGE_SIZE + 1}`)).not.toBeInTheDocument();
    expect(otherOffsets).toEqual([0]);
  });

  it("keeps its rows when 'Load more' fails, and Retry loads that page", async () => {
    const rows = rowsNamed(c, "Row");
    let failSecondPage = true;
    stubApi((path, params) => {
      if (path !== c.endpoint) return answerOther(path);
      if (Number(params.offset) === PAGE_SIZE && failSecondPage) {
        failSecondPage = false;
        throw new Error("server down");
      }
      return answerListPage(rows, params);
    });
    cleanup = renderWithStore(c.page, c.path);
    await expectRow("Row 1");

    await clickLoadMore();

    expect(await screen.findByText(`I couldn't load more ${c.noun}. Want me to try again?`)).toBeInTheDocument();
    await expectRow("Row 1");
    expect(screen.queryByTestId(c.skeleton)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));

    await expectRow(`Row ${PAGE_SIZE + 1}`);
    expect(screen.queryByText(new RegExp(`couldn't load`, "i"))).not.toBeInTheDocument();
    await expectRow("Row 1");
  });
});
