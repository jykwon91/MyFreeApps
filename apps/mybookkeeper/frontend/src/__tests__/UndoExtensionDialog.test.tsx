import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { store } from "@/shared/store";
import UndoExtensionDialog from "@/app/features/leases/UndoExtensionDialog";

const mockUndoExtension = vi.fn();

vi.mock("@/shared/store/signedLeasesApi", () => ({
  useUndoSignedLeaseExtensionMutation: vi.fn(() => [
    mockUndoExtension,
    { isLoading: false },
  ]),
}));

vi.mock("@/shared/lib/toast-store", () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

import { useUndoSignedLeaseExtensionMutation } from "@/shared/store/signedLeasesApi";
import { showSuccess, showError } from "@/shared/lib/toast-store";

function renderDialog(onClose = vi.fn()) {
  return render(
    <Provider store={store}>
      <UndoExtensionDialog
        leaseId="lease-1"
        versionId="version-1"
        currentExtendedEndsOn="2027-06-30"
        onClose={onClose}
      />
    </Provider>,
  );
}

describe("UndoExtensionDialog", () => {
  beforeEach(() => {
    vi.mocked(mockUndoExtension).mockReset();
    vi.mocked(showSuccess).mockReset();
    vi.mocked(showError).mockReset();
    vi.mocked(useUndoSignedLeaseExtensionMutation).mockReturnValue([
      mockUndoExtension,
      { isLoading: false } as unknown as ReturnType<
        typeof useUndoSignedLeaseExtensionMutation
      >[1],
    ]);
  });

  it("renders dialog with current extended date and confirm/cancel buttons", () => {
    renderDialog();
    expect(
      screen.getByRole("dialog", { name: "Undo extension" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/2027-06-30/)).toBeInTheDocument();
    expect(screen.getByTestId("undo-extension-confirm")).toBeInTheDocument();
    expect(screen.getByTestId("undo-extension-cancel")).toBeInTheDocument();
  });

  it("calls onClose when Cancel is clicked", () => {
    const onClose = vi.fn();
    renderDialog(onClose);
    fireEvent.click(screen.getByTestId("undo-extension-cancel"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls undo mutation with leaseId + versionId on Confirm", async () => {
    mockUndoExtension.mockReturnValueOnce({
      unwrap: () => Promise.resolve({}),
    });
    renderDialog();
    fireEvent.click(screen.getByTestId("undo-extension-confirm"));

    await waitFor(() => {
      expect(mockUndoExtension).toHaveBeenCalledWith({
        leaseId: "lease-1",
        versionId: "version-1",
      });
    });
  });

  it("shows success toast and closes on success", async () => {
    mockUndoExtension.mockReturnValueOnce({
      unwrap: () => Promise.resolve({}),
    });
    const onClose = vi.fn();
    renderDialog(onClose);
    fireEvent.click(screen.getByTestId("undo-extension-confirm"));

    await waitFor(() => {
      expect(showSuccess).toHaveBeenCalledWith("Extension undone.");
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  it.each([
    [
      "CANNOT_UNDO_SEED_ROW",
      "The original lease term can't be undone — it's not an extension.",
    ],
    [
      "NOT_LATEST_EXTENSION",
      "A newer extension exists. Undo the latest extension first.",
    ],
    [
      "UNDO_WINDOW_EXPIRED",
      "This extension is older than 30 days and can no longer be undone.",
    ],
  ])("surfaces 409 %s as a friendly toast", async (code, message) => {
    mockUndoExtension.mockReturnValueOnce({
      unwrap: () =>
        Promise.reject({
          status: 409,
          data: { detail: { code, message: "from-backend" } },
        }),
    });
    const onClose = vi.fn();
    renderDialog(onClose);
    fireEvent.click(screen.getByTestId("undo-extension-confirm"));

    await waitFor(() => {
      expect(showError).toHaveBeenCalledWith(message);
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  it("surfaces a generic error toast on unknown failure", async () => {
    mockUndoExtension.mockReturnValueOnce({
      unwrap: () => Promise.reject(new Error("network")),
    });
    renderDialog();
    fireEvent.click(screen.getByTestId("undo-extension-confirm"));

    await waitFor(() => {
      expect(showError).toHaveBeenCalledWith(
        "Couldn't undo the extension. Please try again.",
      );
    });
  });
});
