import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import DuplicateTab from "@/app/features/transactions/DuplicateTab";
import type { DuplicatePair } from "@/shared/types/transaction/duplicate";

const mockPair: DuplicatePair = {
  id: "txn-1_txn-2",
  transaction_a: {
    id: "txn-1",
    transaction_date: "2025-06-15",
    vendor: "Home Depot",
    description: "Plumbing supplies",
    amount: "250.00",
    transaction_type: "expense",
    category: "maintenance",
    property_id: "prop-1",
    payment_method: null,
    channel: null,
    tags: [],
    status: "approved",
    source_document_id: "doc-1",
    source_file_name: "invoice_june.pdf",
    is_manual: false,
    created_at: "2025-06-15T10:00:00Z",
    linked_document_ids: [],
  },
  transaction_b: {
    id: "txn-2",
    transaction_date: "2025-06-18",
    vendor: "Home Depot",
    description: "Plumbing supplies",
    amount: "250.00",
    transaction_type: "expense",
    category: "maintenance",
    property_id: "prop-1",
    payment_method: null,
    channel: null,
    tags: [],
    status: "pending",
    source_document_id: "doc-2",
    source_file_name: "bank_import.csv",
    is_manual: false,
    created_at: "2025-06-18T10:00:00Z",
    linked_document_ids: [],
  },
  date_diff_days: 3,
  property_match: true,
  confidence: "medium",
};

const propertyMap = new Map([["prop-1", "Beach House"]]);
const noop = vi.fn().mockResolvedValue(undefined);

describe("DuplicateTab", () => {
  it("shows loading skeleton when isLoading is true", () => {
    const { container } = render(
      <DuplicateTab
        duplicatePairs={[]}
        isLoading={true}
        propertyMap={propertyMap}
        onMerge={noop}
        onDismiss={noop}
      />,
    );
    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThanOrEqual(1);
  });

  it("shows empty state message when no duplicate pairs", () => {
    render(
      <DuplicateTab
        duplicatePairs={[]}
        isLoading={false}
        propertyMap={propertyMap}
        onMerge={noop}
        onDismiss={noop}
      />,
    );
    expect(screen.getByText(/No suspected duplicates right now/)).toBeInTheDocument();
  });

  it("renders a duplicate card for each pair", () => {
    render(
      <DuplicateTab
        duplicatePairs={[mockPair]}
        isLoading={false}
        propertyMap={propertyMap}
        onMerge={noop}
        onDismiss={noop}
      />,
    );
    // Both transaction sides render the vendor name
    expect(screen.getAllByText("Home Depot")).toHaveLength(2);
  });

  it("shows the date diff label in the card header", () => {
    render(
      <DuplicateTab
        duplicatePairs={[mockPair]}
        isLoading={false}
        propertyMap={propertyMap}
        onMerge={noop}
        onDismiss={noop}
      />,
    );
    expect(screen.getByText("Same amount, 3 days apart")).toBeInTheDocument();
  });

  it("renders Merge and Not Duplicates action buttons", () => {
    render(
      <DuplicateTab
        duplicatePairs={[mockPair]}
        isLoading={false}
        propertyMap={propertyMap}
        onMerge={noop}
        onDismiss={noop}
      />,
    );
    expect(screen.getByText("Merge")).toBeInTheDocument();
    expect(screen.getByText("Not Duplicates")).toBeInTheDocument();
  });

  it("does not show empty state when pairs exist", () => {
    render(
      <DuplicateTab
        duplicatePairs={[mockPair]}
        isLoading={false}
        propertyMap={propertyMap}
        onMerge={noop}
        onDismiss={noop}
      />,
    );
    expect(screen.queryByText(/No suspected duplicates right now/)).not.toBeInTheDocument();
  });

  it("renders one card per pair when multiple pairs exist", () => {
    const secondPair: DuplicatePair = {
      ...mockPair,
      id: "txn-3_txn-4",
      transaction_a: { ...mockPair.transaction_a, id: "txn-3", vendor: "Ace Hardware" },
      transaction_b: { ...mockPair.transaction_b, id: "txn-4", vendor: "Ace Hardware" },
    };

    render(
      <DuplicateTab
        duplicatePairs={[mockPair, secondPair]}
        isLoading={false}
        propertyMap={propertyMap}
        onMerge={noop}
        onDismiss={noop}
      />,
    );

    expect(screen.getAllByText("Home Depot")).toHaveLength(2);
    expect(screen.getAllByText("Ace Hardware")).toHaveLength(2);
  });

  it("does not show skeleton when not loading with pairs", () => {
    const { container } = render(
      <DuplicateTab
        duplicatePairs={[mockPair]}
        isLoading={false}
        propertyMap={propertyMap}
        onMerge={noop}
        onDismiss={noop}
      />,
    );
    // Skeletons render nothing in loaded state — no pulse containers
    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons).toHaveLength(0);
  });
});
