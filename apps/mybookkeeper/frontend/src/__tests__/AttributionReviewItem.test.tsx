import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";
import { store } from "@/shared/store";
import AttributionReviewItem from "@/app/features/attribution/AttributionReviewItem";
import type { AttributionReviewItem as ReviewItemType } from "@/shared/types/attribution/attribution-review";

vi.mock("@/shared/store/attributionApi", () => ({
  useConfirmAttributionReviewMutation: vi.fn(),
  useRejectAttributionReviewMutation: vi.fn(),
  useAttributeTransactionManuallyMutation: vi.fn(),
}));
vi.mock("@/shared/store/applicantsApi", () => ({
  useGetApplicantsQuery: vi.fn(),
}));
vi.mock("@/shared/store/propertiesApi", () => ({
  useGetPropertiesQuery: vi.fn(),
}));
vi.mock("@/shared/lib/toast-store", () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

import {
  useConfirmAttributionReviewMutation,
  useRejectAttributionReviewMutation,
  useAttributeTransactionManuallyMutation,
} from "@/shared/store/attributionApi";
import { useGetApplicantsQuery } from "@/shared/store/applicantsApi";
import { useGetPropertiesQuery } from "@/shared/store/propertiesApi";

function makeItem(overrides: Partial<ReviewItemType> = {}): ReviewItemType {
  return {
    id: "rev-1",
    transaction_id: "txn-1",
    proposed_applicant_id: null,
    proposed_property_id: null,
    confidence: "fuzzy",
    status: "pending",
    created_at: "2026-05-01T10:00:00Z",
    resolved_at: null,
    transaction: {
      id: "txn-1",
      transaction_date: "2026-05-01",
      amount: "1500.00",
      vendor: null,
      payer_name: "Alice Johnsn",
      description: null,
      property_id: null,
      channel: null,
    },
    proposed_applicant: null,
    proposed_property: null,
    ...overrides,
  };
}

const rentFuzzy = (): ReviewItemType =>
  makeItem({
    confidence: "fuzzy",
    proposed_applicant_id: "app-1",
    proposed_applicant: { id: "app-1", legal_name: "Alice Johnson" },
  });

const rentUnmatched = (): ReviewItemType =>
  makeItem({ confidence: "unmatched", proposed_applicant: null });

const airbnbFuzzy = (): ReviewItemType =>
  makeItem({
    confidence: "fuzzy",
    proposed_property_id: "p1",
    proposed_property: { id: "p1", name: "Beach House" },
    transaction: {
      id: "txn-1",
      transaction_date: "2026-05-01",
      amount: "920.00",
      vendor: null,
      payer_name: null,
      description: null,
      property_id: null,
      channel: "airbnb",
    },
  });

const airbnbUnmatched = (): ReviewItemType =>
  makeItem({
    confidence: "unmatched",
    transaction: {
      id: "txn-1",
      transaction_date: "2026-05-01",
      amount: "920.00",
      vendor: null,
      payer_name: null,
      description: null,
      property_id: null,
      channel: "airbnb",
    },
  });

let confirmTrigger: ReturnType<typeof vi.fn>;
let rejectTrigger: ReturnType<typeof vi.fn>;
let attributeTrigger: ReturnType<typeof vi.fn>;

function resolvedUnwrap() {
  return { unwrap: () => Promise.resolve({ ok: true, transaction_id: "t" }) };
}

function setConfirmLoading(isLoading: boolean) {
  vi.mocked(useConfirmAttributionReviewMutation).mockReturnValue([
    confirmTrigger,
    { isLoading },
  ] as unknown as ReturnType<typeof useConfirmAttributionReviewMutation>);
}
function setAttributeLoading(isLoading: boolean) {
  vi.mocked(useAttributeTransactionManuallyMutation).mockReturnValue([
    attributeTrigger,
    { isLoading },
  ] as unknown as ReturnType<typeof useAttributeTransactionManuallyMutation>);
}

beforeEach(() => {
  vi.clearAllMocks();
  confirmTrigger = vi.fn(resolvedUnwrap);
  rejectTrigger = vi.fn(() => ({ unwrap: () => Promise.resolve({ ok: true }) }));
  attributeTrigger = vi.fn(resolvedUnwrap);
  setConfirmLoading(false);
  vi.mocked(useRejectAttributionReviewMutation).mockReturnValue([
    rejectTrigger,
    { isLoading: false },
  ] as unknown as ReturnType<typeof useRejectAttributionReviewMutation>);
  setAttributeLoading(false);
  vi.mocked(useGetApplicantsQuery).mockReturnValue({
    data: { items: [{ id: "a1", legal_name: "Bob Tenant" }] },
    isLoading: false,
  } as unknown as ReturnType<typeof useGetApplicantsQuery>);
  vi.mocked(useGetPropertiesQuery).mockReturnValue({
    data: [
      { id: "p1", name: "Beach House", is_active: true },
      { id: "p2", name: "Cabin", is_active: true },
    ],
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof useGetPropertiesQuery>);
});

function renderItem(item: ReviewItemType) {
  return render(
    <Provider store={store}>
      <BrowserRouter>
        <AttributionReviewItem item={item} />
      </BrowserRouter>
    </Provider>,
  );
}

describe("AttributionReviewItem", () => {
  it("rent-fuzzy: shows 'Yes, that's them' + tenant name, no property/badge UI", () => {
    renderItem(rentFuzzy());
    expect(screen.getByRole("button", { name: /Yes, that's them/ })).toBeInTheDocument();
    expect(screen.getByText("Alice Johnson")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Not them" })).toBeInTheDocument();
    expect(screen.queryByText("Airbnb payout")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: /pick a property/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: /pick a tenant/i }),
    ).not.toBeInTheDocument();
  });

  it("rent-unmatched: shows tenant select + Link, reject label 'Not them'", () => {
    renderItem(rentUnmatched());
    expect(
      screen.getByRole("combobox", { name: /pick a tenant/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Bob Tenant" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Link$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Not them" })).toBeInTheDocument();
    expect(
      screen.getByText("Couldn't match this to any of your tenants."),
    ).toBeInTheDocument();
  });

  it("airbnb-fuzzy: shows channel badge + 'Assign to <name>' + cue, no tenant picker", () => {
    renderItem(airbnbFuzzy());
    expect(screen.getByText("Airbnb payout")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Assign to Beach House/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Looks like a payout for/)).toBeInTheDocument();
    expect(screen.getByText("Beach House")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Not this property" })).toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: /pick a tenant/i }),
    ).not.toBeInTheDocument();
  });

  it("airbnb-unmatched: shows property select + Assign + badge, reject label 'Skip'", () => {
    renderItem(airbnbUnmatched());
    expect(screen.getByText("Airbnb payout")).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: /pick a property/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Beach House" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Assign$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skip" })).toBeInTheDocument();
    expect(
      screen.getByText("Couldn't figure out which property this payout belongs to."),
    ).toBeInTheDocument();
  });

  it("airbnb-fuzzy: confirm fires confirmReview({review_id, property_id}) — not applicant/attributeManually", async () => {
    renderItem(airbnbFuzzy());
    fireEvent.click(screen.getByRole("button", { name: /Assign to Beach House/ }));
    await waitFor(() =>
      expect(confirmTrigger).toHaveBeenCalledWith({
        review_id: "rev-1",
        property_id: "p1",
      }),
    );
    expect(attributeTrigger).not.toHaveBeenCalled();
  });

  it("airbnb-unmatched: Assign fires confirmReview({review_id, property_id}) — not attributeManually", async () => {
    renderItem(airbnbUnmatched());
    fireEvent.change(screen.getByRole("combobox", { name: /pick a property/i }), {
      target: { value: "p2" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Assign$/ }));
    await waitFor(() =>
      expect(confirmTrigger).toHaveBeenCalledWith({
        review_id: "rev-1",
        property_id: "p2",
      }),
    );
    expect(attributeTrigger).not.toHaveBeenCalled();
  });

  it("rent-unmatched: Link fires attributeManually({transaction_id, applicant_id}) — regression", async () => {
    renderItem(rentUnmatched());
    fireEvent.change(screen.getByRole("combobox", { name: /pick a tenant/i }), {
      target: { value: "a1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Link$/ }));
    await waitFor(() =>
      expect(attributeTrigger).toHaveBeenCalledWith({
        transaction_id: "txn-1",
        applicant_id: "a1",
      }),
    );
    expect(confirmTrigger).not.toHaveBeenCalled();
  });

  it("rent-fuzzy: confirm fires confirmReview({review_id}) only — no property_id, no attributeManually (parity regression)", async () => {
    renderItem(rentFuzzy());
    fireEvent.click(screen.getByRole("button", { name: /Yes, that's them/ }));
    await waitFor(() =>
      expect(confirmTrigger).toHaveBeenCalledWith({ review_id: "rev-1" }),
    );
    expect(confirmTrigger).not.toHaveBeenCalledWith(
      expect.objectContaining({ property_id: expect.anything() }),
    );
    expect(attributeTrigger).not.toHaveBeenCalled();
  });

  it("all shapes: reject is disabled while the primary action is in flight", async () => {
    const pending = new Promise<{ ok: boolean }>(() => {});
    const pendingUnwrap = () => ({ unwrap: () => pending });

    // rent-fuzzy → confirm in flight
    confirmTrigger = vi.fn(pendingUnwrap);
    setConfirmLoading(true);
    let view = renderItem(rentFuzzy());
    fireEvent.click(screen.getByRole("button", { name: /Yes, that's them/ }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Not them" })).toBeDisabled(),
    );
    view.unmount();

    // airbnb-fuzzy → confirm in flight
    confirmTrigger = vi.fn(pendingUnwrap);
    setConfirmLoading(true);
    view = renderItem(airbnbFuzzy());
    fireEvent.click(screen.getByRole("button", { name: /Assign to Beach House/ }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Not this property" }),
      ).toBeDisabled(),
    );
    view.unmount();

    // airbnb-unmatched → confirm (via picker) in flight
    confirmTrigger = vi.fn(pendingUnwrap);
    setConfirmLoading(true);
    view = renderItem(airbnbUnmatched());
    fireEvent.change(screen.getByRole("combobox", { name: /pick a property/i }), {
      target: { value: "p1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Assign$/ }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Skip" })).toBeDisabled(),
    );
    view.unmount();

    // rent-unmatched → attributeManually in flight
    attributeTrigger = vi.fn(pendingUnwrap);
    setAttributeLoading(true);
    view = renderItem(rentUnmatched());
    fireEvent.change(screen.getByRole("combobox", { name: /pick a tenant/i }), {
      target: { value: "a1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Link$/ }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Not them" })).toBeDisabled(),
    );
    view.unmount();
  });

  it("airbnb-fuzzy: while confirming, primary shows 'Assigning...' and reject is disabled", async () => {
    const pending = new Promise<{ ok: boolean }>(() => {});
    confirmTrigger = vi.fn(() => ({ unwrap: () => pending }));
    setConfirmLoading(true);
    renderItem(airbnbFuzzy());
    fireEvent.click(screen.getByRole("button", { name: /Assign to Beach House/ }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Assigning/ })).toBeDisabled(),
    );
    expect(screen.getByRole("button", { name: "Not this property" })).toBeDisabled();
  });

  it("airbnb-unmatched: empty properties → message + disabled Assign + no picker", () => {
    vi.mocked(useGetPropertiesQuery).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useGetPropertiesQuery>);
    renderItem(airbnbUnmatched());
    expect(
      screen.getByText("No properties set up yet — add one in Settings."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Assign$/ })).toBeDisabled();
    expect(
      screen.queryByRole("combobox", { name: /pick a property/i }),
    ).not.toBeInTheDocument();
  });

  it("rent-unmatched: empty tenants → message + disabled Link + no picker", () => {
    vi.mocked(useGetApplicantsQuery).mockReturnValue({
      data: { items: [] },
      isLoading: false,
      isError: false,
      isUninitialized: false,
    } as unknown as ReturnType<typeof useGetApplicantsQuery>);
    renderItem(rentUnmatched());
    expect(
      screen.getByText(
        "No tenants with a signed lease yet — add one in Applicants.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Link$/ })).toBeDisabled();
    expect(
      screen.queryByRole("combobox", { name: /pick a tenant/i }),
    ).not.toBeInTheDocument();
  });
});
