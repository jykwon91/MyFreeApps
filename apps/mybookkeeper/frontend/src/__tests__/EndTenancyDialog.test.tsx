import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { store } from "@/shared/store";
import EndTenancyDialog from "@/app/features/tenants/EndTenancyDialog";

const mockEndTenancy = vi.fn();

vi.mock("@/shared/store/applicantsApi", () => ({
  useEndTenancyMutation: vi.fn(() => [mockEndTenancy, { isLoading: false }]),
}));

vi.mock("@/shared/lib/toast-store", () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

import { useEndTenancyMutation } from "@/shared/store/applicantsApi";
import { showSuccess, showError } from "@/shared/lib/toast-store";

function renderDialog(onClose = vi.fn()) {
  return render(
    <Provider store={store}>
      <EndTenancyDialog
        applicantId="app-1"
        tenantName="Jane Doe"
        onClose={onClose}
      />
    </Provider>,
  );
}

describe("EndTenancyDialog", () => {
  beforeEach(() => {
    vi.mocked(mockEndTenancy).mockReset();
    vi.mocked(showSuccess).mockReset();
    vi.mocked(showError).mockReset();
    vi.mocked(useEndTenancyMutation).mockReturnValue([mockEndTenancy, { isLoading: false } as unknown as ReturnType<typeof useEndTenancyMutation>[1]]);
  });

  it("renders the dialog with tenant name and form elements", () => {
    renderDialog();
    expect(screen.getByRole("dialog", { name: "End tenancy" })).toBeInTheDocument();
    expect(screen.getByText(/Jane Doe/)).toBeInTheDocument();
    expect(screen.getByTestId("end-tenancy-reason")).toBeInTheDocument();
    expect(screen.getByTestId("end-tenancy-confirm")).toBeInTheDocument();
    expect(screen.getByTestId("end-tenancy-cancel")).toBeInTheDocument();
  });

  it("calls onClose when Cancel is clicked", () => {
    const onClose = vi.fn();
    renderDialog(onClose);
    fireEvent.click(screen.getByTestId("end-tenancy-cancel"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls endTenancy mutation without reason when confirmed with no input", async () => {
    mockEndTenancy.mockReturnValueOnce({ unwrap: () => Promise.resolve({}) });
    const onClose = vi.fn();
    renderDialog(onClose);
    fireEvent.click(screen.getByTestId("end-tenancy-confirm"));

    await waitFor(() => {
      expect(mockEndTenancy).toHaveBeenCalledWith({
        applicantId: "app-1",
        data: { reason: null },
      });
    });
  });

  it("calls endTenancy mutation with reason when reason is entered", async () => {
    mockEndTenancy.mockReturnValueOnce({ unwrap: () => Promise.resolve({}) });
    renderDialog();
    fireEvent.change(screen.getByTestId("end-tenancy-reason"), {
      target: { value: "Lease not renewed" },
    });
    fireEvent.click(screen.getByTestId("end-tenancy-confirm"));

    await waitFor(() => {
      expect(mockEndTenancy).toHaveBeenCalledWith({
        applicantId: "app-1",
        data: { reason: "Lease not renewed" },
      });
    });
  });

  it("shows success toast and calls onClose on successful submission", async () => {
    mockEndTenancy.mockReturnValueOnce({ unwrap: () => Promise.resolve({}) });
    const onClose = vi.fn();
    renderDialog(onClose);
    fireEvent.click(screen.getByTestId("end-tenancy-confirm"));

    await waitFor(() => {
      expect(showSuccess).toHaveBeenCalledWith("Tenancy ended for Jane Doe.");
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  it("shows error toast and does not close on mutation failure", async () => {
    mockEndTenancy.mockReturnValueOnce({
      unwrap: () => Promise.reject(new Error("Server error")),
    });
    const onClose = vi.fn();
    renderDialog(onClose);
    fireEvent.click(screen.getByTestId("end-tenancy-confirm"));

    await waitFor(() => {
      expect(showError).toHaveBeenCalledWith(
        "Couldn't end the tenancy. Please try again.",
      );
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  it("updates character counter as reason is typed", () => {
    renderDialog();
    const textarea = screen.getByTestId("end-tenancy-reason");
    fireEvent.change(textarea, { target: { value: "Test reason" } });
    expect(screen.getByText("11/500")).toBeInTheDocument();
  });
});
