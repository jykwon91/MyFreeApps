import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import SignedLeaseStatusBadge from "@/app/features/leases/SignedLeaseStatusBadge";
import {
  SIGNED_LEASE_STATUSES,
  type SignedLeaseStatus,
} from "@/shared/types/lease/signed-lease-status";
import { SIGNED_LEASE_STATUS_LABELS } from "@/shared/lib/lease-labels";

describe("SignedLeaseStatusBadge", () => {
  it.each(SIGNED_LEASE_STATUSES)("renders the label for status '%s'", (status) => {
    const { unmount } = render(<SignedLeaseStatusBadge status={status as SignedLeaseStatus} />);
    expect(screen.getByTestId(`signed-lease-status-badge-${status}`)).toBeInTheDocument();
    expect(screen.getByText(SIGNED_LEASE_STATUS_LABELS[status])).toBeInTheDocument();
    unmount();
  });

  it("applies green styling for the 'signed' status (positive outcome)", () => {
    render(<SignedLeaseStatusBadge status="signed" />);
    const badge = screen.getByTestId("signed-lease-status-badge-signed");
    expect(badge.className).toMatch(/bg-green-100/);
  });

  it("applies red styling for the 'terminated' status (negative outcome)", () => {
    render(<SignedLeaseStatusBadge status="terminated" />);
    const badge = screen.getByTestId("signed-lease-status-badge-terminated");
    expect(badge.className).toMatch(/bg-red-100/);
  });

  it("applies gray styling for the 'draft' status (early state)", () => {
    render(<SignedLeaseStatusBadge status="draft" />);
    const badge = screen.getByTestId("signed-lease-status-badge-draft");
    expect(badge.className).toMatch(/bg-gray-100/);
  });

  it("merges custom className", () => {
    render(<SignedLeaseStatusBadge status="draft" className="my-custom-class" />);
    const badge = screen.getByTestId("signed-lease-status-badge-draft");
    expect(badge.className).toMatch(/my-custom-class/);
  });
});
