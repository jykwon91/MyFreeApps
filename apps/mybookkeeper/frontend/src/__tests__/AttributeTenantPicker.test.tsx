import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { store } from "@/shared/store";
import AttributeTenantPicker from "@/app/features/transactions/AttributeTenantPicker";

vi.mock("@/shared/store/applicantsApi", () => ({
  useGetTenantsQuery: vi.fn(),
}));
vi.mock("@/shared/store/attributionApi", () => ({
  useAttributeTransactionManuallyMutation: vi.fn(),
}));
vi.mock("@/shared/lib/toast-store", () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

import { useGetTenantsQuery } from "@/shared/store/applicantsApi";
import { useAttributeTransactionManuallyMutation } from "@/shared/store/attributionApi";
import { showSuccess } from "@/shared/lib/toast-store";

const resolvedUnwrap = () => ({ unwrap: () => Promise.resolve({ ok: true }) });
let attributeTrigger: ReturnType<typeof vi.fn>;

function mockTenants(
  state: Partial<ReturnType<typeof useGetTenantsQuery>>,
): void {
  vi.mocked(useGetTenantsQuery).mockReturnValue({
    data: undefined,
    isLoading: false,
    ...state,
  } as unknown as ReturnType<typeof useGetTenantsQuery>);
}

beforeEach(() => {
  vi.clearAllMocks();
  attributeTrigger = vi.fn(resolvedUnwrap);
  vi.mocked(useAttributeTransactionManuallyMutation).mockReturnValue([
    attributeTrigger,
    { isLoading: false },
  ] as unknown as ReturnType<typeof useAttributeTransactionManuallyMutation>);
});

function renderPicker(currentApplicantId: string | null = null) {
  return render(
    <Provider store={store}>
      <AttributeTenantPicker
        transactionId="txn-1"
        currentApplicantId={currentApplicantId}
        currentAttributionSource={null}
      />
    </Provider>,
  );
}

describe("AttributeTenantPicker", () => {
  it("queries the dedicated tenants endpoint with a within-cap limit", () => {
    // Regression guard: the generic /applicants endpoint caps limit at 100;
    // requesting it with limit > 100 returned 422 and rendered as the empty
    // state. The picker must use the tenants endpoint with a valid limit.
    mockTenants({ data: { items: [], total: 0, has_more: false } });
    renderPicker();
    expect(vi.mocked(useGetTenantsQuery)).toHaveBeenCalledWith({ limit: 100 });
    const [[args]] = vi.mocked(useGetTenantsQuery).mock.calls;
    expect((args as { limit: number }).limit).toBeLessThanOrEqual(100);
  });

  it("shows a loading skeleton while fetching (no empty message, no select)", () => {
    mockTenants({ isLoading: true });
    renderPicker();
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    expect(
      screen.queryByText("No lease-signed tenants to link to."),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("shows the empty message when there are no lease-signed tenants", () => {
    mockTenants({ data: { items: [], total: 0, has_more: false } });
    renderPicker();
    expect(
      screen.getByText("No lease-signed tenants to link to."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("renders a tenant option for each lease-signed tenant returned", () => {
    mockTenants({
      data: {
        items: [
          { id: "a1", legal_name: "Prince Kapoor" },
          { id: "a2", legal_name: "Dana Wells" },
        ],
        total: 2,
        has_more: false,
      },
    });
    renderPicker();
    expect(
      screen.queryByText("No lease-signed tenants to link to."),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Prince Kapoor" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Dana Wells" }),
    ).toBeInTheDocument();
  });

  it("links the payment to the selected tenant", async () => {
    mockTenants({
      data: {
        items: [{ id: "a1", legal_name: "Prince Kapoor" }],
        total: 1,
        has_more: false,
      },
    });
    renderPicker();

    fireEvent.change(screen.getByRole("combobox", { name: /select tenant/i }), {
      target: { value: "a1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Link$/ }));

    await waitFor(() => {
      expect(attributeTrigger).toHaveBeenCalledWith({
        transaction_id: "txn-1",
        applicant_id: "a1",
      });
    });
    expect(vi.mocked(showSuccess)).toHaveBeenCalledWith(
      "Payment linked to tenant.",
    );
  });
});
