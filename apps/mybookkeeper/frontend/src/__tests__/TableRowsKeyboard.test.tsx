import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import VendorRow from "@/app/features/vendors/VendorRow";
import ApplicantRow from "@/app/features/applicants/ApplicantRow";
import TenantRow from "@/app/features/tenants/TenantRow";
import InquiryRow from "@/app/features/inquiries/InquiryRow";
import ListingTableRow from "@/app/features/listings/ListingTableRow";
import WelcomeManualTableRow from "@/app/features/welcome-manuals/WelcomeManualTableRow";
import type { VendorSummary } from "@mybookkeeper/api-client/types/vendor/vendor-summary";
import type { ApplicantSummary } from "@mybookkeeper/api-client/types/applicant/applicant-summary";
import type { InquirySummary } from "@mybookkeeper/api-client/types/inquiry/inquiry-summary";
import type { ListingSummary } from "@mybookkeeper/api-client/types/listing/listing-summary";
import type { WelcomeManualSummary } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-summary";

vi.mock("@/app/features/applicants/ApplicantStageBadge", () => ({ default: () => <span>stage</span> }));
vi.mock("@/app/features/tenants/TenantStatusBadge", () => ({ default: () => <span>status</span> }));
vi.mock("@/app/features/vendors/VendorCategoryBadge", () => ({ default: () => <span>category</span> }));
vi.mock("@/app/features/inquiries/InquiryQualityBadge", () => ({ default: () => <span>quality</span> }));
vi.mock("@/app/features/inquiries/InquirySpamBadge", () => ({ default: () => <span>spam</span> }));
vi.mock("@/app/features/inquiries/InquiryStageBadge", () => ({ default: () => <span>stage</span> }));
vi.mock("@/shared/components/ui/SourceBadge", () => ({ default: () => <span>source</span> }));
vi.mock("@/app/features/listings/ListingStatusBadge", () => ({ default: () => <span>status</span> }));

const VENDOR = {
  id: "v1",
  name: "Acme Plumbing",
  category: "plumber",
  preferred: false,
  hourly_rate: null,
  last_used_at: null,
} as unknown as VendorSummary;

const APPLICANT = {
  id: "a1",
  legal_name: "Jane Doe",
  employer_or_hospital: null,
  contract_start: null,
  contract_end: null,
  created_at: "2025-01-01T00:00:00Z",
  stage: "lead",
} as unknown as ApplicantSummary;

const INQUIRY = {
  id: "i1",
  inquirer_name: "Sam Lee",
  inquirer_employer: null,
  desired_start_date: null,
  desired_end_date: null,
  received_at: "2025-01-01T00:00:00Z",
  source: "direct",
  stage: "new",
  spam_status: "clean",
  spam_score: null,
  last_message_preview: null,
} as unknown as InquirySummary;

const LISTING = {
  id: "l1",
  title: "Garden room",
  room_type: "private_room",
  status: "active",
  monthly_rate: "1200.00",
} as unknown as ListingSummary;

const MANUAL = {
  id: "m1",
  title: "House guide",
  section_count: 2,
  updated_at: "2025-01-01T00:00:00Z",
} as unknown as WelcomeManualSummary;

function Location() {
  return <span data-testid="location">{useLocation().pathname}</span>;
}

function renderRow(row: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={["/start"]}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <table>
                <tbody>{row}</tbody>
              </table>
              <Location />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

const ROWS: { name: string; testId: string; path: string; linkName: string; row: React.ReactNode }[] = [
  { name: "VendorRow", testId: "vendor-row-v1", path: "/vendors/v1", linkName: "Acme Plumbing", row: <VendorRow vendor={VENDOR} showCategoryBadge /> },
  { name: "ApplicantRow", testId: "applicant-row-a1", path: "/applicants/a1", linkName: "Jane Doe", row: <ApplicantRow applicant={APPLICANT} /> },
  { name: "TenantRow", testId: "tenant-row-a1", path: "/tenants/a1", linkName: "Jane Doe", row: <TenantRow tenant={APPLICANT} /> },
  { name: "InquiryRow", testId: "inquiry-row-i1", path: "/inquiries/i1", linkName: "Sam Lee", row: <InquiryRow inquiry={INQUIRY} listingTitle={null} /> },
  { name: "ListingTableRow", testId: "listing-row-l1", path: "/listings/l1", linkName: "Garden room", row: <ListingTableRow listing={LISTING} propertyName="Main St" /> },
  { name: "WelcomeManualTableRow", testId: "welcome-manual-row-m1", path: "/welcome-manuals/m1", linkName: "House guide", row: <WelcomeManualTableRow manual={MANUAL} propertyName={null} /> },
];

describe.each(ROWS)("$name keyboard access", ({ testId, path, linkName, row }) => {
  it("keeps the row a plain table row and names it by a real link", () => {
    renderRow(row);
    const el = screen.getByTestId(testId);
    expect(el).not.toHaveAttribute("role");
    expect(el).not.toHaveAttribute("tabindex");
    expect(screen.getByRole("row")).toBe(el);
    expect(within(el).getByRole("link", { name: linkName })).toHaveAttribute("href", path);
  });

  it("opens the detail page from the link", () => {
    renderRow(row);
    fireEvent.click(screen.getByRole("link", { name: linkName }));
    expect(screen.getByTestId("location")).toHaveTextContent(path);
  });

  it("still opens on a click anywhere on the row", () => {
    renderRow(row);
    fireEvent.click(screen.getByTestId(testId));
    expect(screen.getByTestId("location")).toHaveTextContent(path);
  });
});
