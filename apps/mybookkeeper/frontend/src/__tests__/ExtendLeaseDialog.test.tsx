import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { store } from "@/shared/store";
import ExtendLeaseDialog from "@/app/features/leases/ExtendLeaseDialog";

const mockExtendLease = vi.fn();

vi.mock("@/shared/store/signedLeasesApi", () => ({
  useExtendSignedLeaseMutation: vi.fn(() => [
    mockExtendLease,
    { isLoading: false },
  ]),
}));

vi.mock("@/shared/lib/toast-store", () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

import { useExtendSignedLeaseMutation } from "@/shared/store/signedLeasesApi";
import { showSuccess, showError } from "@/shared/lib/toast-store";

function renderDialog(onClose = vi.fn(), currentEndsOn = "2026-12-31") {
  return render(
    <Provider store={store}>
      <ExtendLeaseDialog
        leaseId="lease-1"
        currentEndsOn={currentEndsOn}
        onClose={onClose}
      />
    </Provider>,
  );
}

describe("ExtendLeaseDialog", () => {
  beforeEach(() => {
    vi.mocked(mockExtendLease).mockReset();
    vi.mocked(showSuccess).mockReset();
    vi.mocked(showError).mockReset();
    vi.mocked(useExtendSignedLeaseMutation).mockReturnValue([
      mockExtendLease,
      { isLoading: false } as unknown as ReturnType<
        typeof useExtendSignedLeaseMutation
      >[1],
    ]);
  });

  it("renders dialog with current end date and required form fields", () => {
    renderDialog();
    expect(
      screen.getByRole("dialog", { name: "Extend lease" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/2026-12-31/)).toBeInTheDocument();
    expect(screen.getByTestId("extend-lease-new-end")).toBeInTheDocument();
    expect(screen.getByTestId("extend-lease-notes")).toBeInTheDocument();
    expect(screen.getByTestId("extend-lease-email-tenant")).toBeInTheDocument();
    expect(screen.getByTestId("extend-lease-confirm")).toBeDisabled();
  });

  it("disables Confirm when new date is equal to or before current", () => {
    renderDialog(undefined, "2026-12-31");
    const input = screen.getByTestId("extend-lease-new-end");
    fireEvent.change(input, { target: { value: "2026-12-31" } });
    expect(screen.getByTestId("extend-lease-confirm")).toBeDisabled();
    expect(
      screen.getByTestId("extend-lease-new-end-error"),
    ).toBeInTheDocument();
  });

  it("enables Confirm when new date is strictly after current", () => {
    renderDialog(undefined, "2026-12-31");
    fireEvent.change(screen.getByTestId("extend-lease-new-end"), {
      target: { value: "2027-06-30" },
    });
    expect(screen.getByTestId("extend-lease-confirm")).not.toBeDisabled();
  });

  it("calls extend mutation with new_ends_on + notes + email_tenant", async () => {
    mockExtendLease.mockReturnValueOnce({ unwrap: () => Promise.resolve({}) });
    renderDialog();
    fireEvent.change(screen.getByTestId("extend-lease-new-end"), {
      target: { value: "2027-06-30" },
    });
    fireEvent.change(screen.getByTestId("extend-lease-notes"), {
      target: { value: "Six-month renewal" },
    });
    fireEvent.click(screen.getByTestId("extend-lease-email-tenant"));
    fireEvent.click(screen.getByTestId("extend-lease-confirm"));

    await waitFor(() => {
      expect(mockExtendLease).toHaveBeenCalledWith({
        leaseId: "lease-1",
        data: {
          new_ends_on: "2027-06-30",
          notes: "Six-month renewal",
          email_tenant: true,
        },
      });
    });
  });

  it("omits notes from payload when empty", async () => {
    mockExtendLease.mockReturnValueOnce({ unwrap: () => Promise.resolve({}) });
    renderDialog();
    fireEvent.change(screen.getByTestId("extend-lease-new-end"), {
      target: { value: "2027-06-30" },
    });
    fireEvent.click(screen.getByTestId("extend-lease-confirm"));

    await waitFor(() => {
      expect(mockExtendLease).toHaveBeenCalledWith({
        leaseId: "lease-1",
        data: {
          new_ends_on: "2027-06-30",
          notes: undefined,
          email_tenant: false,
        },
      });
    });
  });

  it("shows success toast and calls onClose on success", async () => {
    mockExtendLease.mockReturnValueOnce({ unwrap: () => Promise.resolve({}) });
    const onClose = vi.fn();
    renderDialog(onClose);
    fireEvent.change(screen.getByTestId("extend-lease-new-end"), {
      target: { value: "2027-06-30" },
    });
    fireEvent.click(screen.getByTestId("extend-lease-confirm"));

    await waitFor(() => {
      expect(showSuccess).toHaveBeenCalledWith("Lease extended.");
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  it("shows email-aware success message when email_tenant was checked", async () => {
    mockExtendLease.mockReturnValueOnce({ unwrap: () => Promise.resolve({}) });
    renderDialog();
    fireEvent.change(screen.getByTestId("extend-lease-new-end"), {
      target: { value: "2027-06-30" },
    });
    fireEvent.click(screen.getByTestId("extend-lease-email-tenant"));
    fireEvent.click(screen.getByTestId("extend-lease-confirm"));

    await waitFor(() => {
      expect(showSuccess).toHaveBeenCalledWith(
        "Lease extended. I'll email the tenant shortly.",
      );
    });
  });

  it("surfaces a 409 INVALID_STATUS_FOR_EXTENSION as a friendly toast", async () => {
    mockExtendLease.mockReturnValueOnce({
      unwrap: () =>
        Promise.reject({
          status: 409,
          data: {
            detail: {
              code: "INVALID_STATUS_FOR_EXTENSION",
              message: "lease is in draft",
            },
          },
        }),
    });
    const onClose = vi.fn();
    renderDialog(onClose);
    fireEvent.change(screen.getByTestId("extend-lease-new-end"), {
      target: { value: "2027-06-30" },
    });
    fireEvent.click(screen.getByTestId("extend-lease-confirm"));

    await waitFor(() => {
      expect(showError).toHaveBeenCalledWith(
        "Only signed or active leases can be extended.",
      );
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  it("surfaces a generic error toast on unknown failure", async () => {
    mockExtendLease.mockReturnValueOnce({
      unwrap: () => Promise.reject(new Error("network down")),
    });
    renderDialog();
    fireEvent.change(screen.getByTestId("extend-lease-new-end"), {
      target: { value: "2027-06-30" },
    });
    fireEvent.click(screen.getByTestId("extend-lease-confirm"));

    await waitFor(() => {
      expect(showError).toHaveBeenCalledWith(
        "Couldn't extend the lease. Please try again.",
      );
    });
  });

  it("calls onClose when Cancel is clicked", () => {
    const onClose = vi.fn();
    renderDialog(onClose);
    fireEvent.click(screen.getByTestId("extend-lease-cancel"));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
