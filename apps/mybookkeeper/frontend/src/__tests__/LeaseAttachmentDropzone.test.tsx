/**
 * Unit tests for LeaseAttachmentDropzone.
 *
 * Coverage:
 * - Renders the dropzone and kind selector
 * - Clicking "browse" triggers the hidden file input
 * - Selecting a file calls the upload mutation with the selected kind
 * - Shows uploading state while mutation is in flight
 * - onUploaded callback fires after successful upload
 * - Unsupported MIME types are rejected with an error toast
 * - disabled prop makes the zone non-interactive
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { store } from "@/shared/store";
import LeaseAttachmentDropzone from "@/app/features/leases/LeaseAttachmentDropzone";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUpload = vi.fn();

vi.mock("@/shared/store/signedLeasesApi", () => ({
  useUploadSignedLeaseAttachmentMutation: vi.fn(() => [mockUpload, { isLoading: false }]),
}));

import { showError as showErrorMock, showSuccess as showSuccessMock } from "@/shared/lib/toast-store";

vi.mock("@/shared/lib/toast-store", () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderDropzone(props: Partial<React.ComponentProps<typeof LeaseAttachmentDropzone>> = {}) {
  return render(
    <Provider store={store}>
      <LeaseAttachmentDropzone leaseId="lease-1" {...props} />
    </Provider>,
  );
}

function makeFile(name: string, type = "application/pdf"): File {
  return new File(["content"], name, { type });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("LeaseAttachmentDropzone", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the dropzone and kind select", () => {
    renderDropzone();
    expect(screen.getByTestId("lease-attachment-dropzone")).toBeInTheDocument();
    expect(screen.getByTestId("lease-attachment-kind-select")).toBeInTheDocument();
  });

  it("calls upload mutation when a valid file is selected via browse", async () => {
    mockUpload.mockReturnValue({ unwrap: () => Promise.resolve({ id: "att-1" }) });

    renderDropzone();

    const input = document.querySelector<HTMLInputElement>("input[type='file']");
    expect(input).not.toBeNull();

    const file = makeFile("lease.pdf");
    await userEvent.upload(input!, file);

    await waitFor(() => {
      expect(mockUpload).toHaveBeenCalledWith(
        expect.objectContaining({ leaseId: "lease-1", file, kind: "signed_lease" }),
      );
    });
  });

  it("shows success toast after upload", async () => {
    mockUpload.mockReturnValue({ unwrap: () => Promise.resolve({ id: "att-1" }) });

    renderDropzone();
    const input = document.querySelector<HTMLInputElement>("input[type='file']");
    await userEvent.upload(input!, makeFile("lease.pdf"));

    await waitFor(() => {
      expect(showSuccessMock).toHaveBeenCalledWith("lease.pdf uploaded.");
    });
  });

  it("calls onUploaded after successful upload", async () => {
    mockUpload.mockReturnValue({ unwrap: () => Promise.resolve({ id: "att-1" }) });
    const onUploaded = vi.fn();

    renderDropzone({ onUploaded });
    const input = document.querySelector<HTMLInputElement>("input[type='file']");
    await userEvent.upload(input!, makeFile("lease.pdf"));

    await waitFor(() => {
      expect(onUploaded).toHaveBeenCalledWith(1);
    });
  });

  it("does not call onUploaded when upload fails", async () => {
    mockUpload.mockReturnValue({ unwrap: () => Promise.reject({ status: 500 }) });
    const onUploaded = vi.fn();

    renderDropzone({ onUploaded });
    const input = document.querySelector<HTMLInputElement>("input[type='file']");
    await userEvent.upload(input!, makeFile("lease.pdf"));

    await waitFor(() => {
      expect(showErrorMock).toHaveBeenCalled();
    });
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it("rejects unsupported MIME types and shows error toast", async () => {
    renderDropzone();
    const input = document.querySelector<HTMLInputElement>("input[type='file']");
    const badFile = makeFile("spreadsheet.xlsx", "application/vnd.ms-excel");

    // Use fireEvent.change to bypass userEvent's accept-attribute filtering,
    // so the onChange handler fires and exercises the component's own MIME check.
    Object.defineProperty(input, "files", {
      value: Object.assign([badFile], { item: (i: number) => [badFile][i] }),
      configurable: true,
    });
    fireEvent.change(input!);

    await waitFor(() => {
      expect(showErrorMock).toHaveBeenCalledWith(expect.stringContaining("unsupported file type"));
    });
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("uses the selected kind for single-file upload", async () => {
    mockUpload.mockReturnValue({ unwrap: () => Promise.resolve({ id: "att-1" }) });

    renderDropzone();

    const kindSelect = screen.getByTestId("lease-attachment-kind-select");
    fireEvent.change(kindSelect, { target: { value: "move_in_inspection" } });

    const input = document.querySelector<HTMLInputElement>("input[type='file']");
    await userEvent.upload(input!, makeFile("inspection.pdf"));

    await waitFor(() => {
      expect(mockUpload).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "move_in_inspection" }),
      );
    });
  });

  it("uses inferKindsForFiles for multi-file drops", async () => {
    mockUpload.mockReturnValue({ unwrap: () => Promise.resolve({ id: "att-1" }) });

    renderDropzone();
    const input = document.querySelector<HTMLInputElement>("input[type='file']");
    const files = [
      makeFile("Lease Agreement.pdf"),
      makeFile("House Rules.pdf"),
    ];
    await userEvent.upload(input!, files);

    await waitFor(() => {
      expect(mockUpload).toHaveBeenCalledTimes(2);
      // First file: "Lease Agreement.pdf" → signed_lease
      expect(mockUpload).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ kind: "signed_lease" }),
      );
      // Second file: "House Rules.pdf" → signed_addendum
      expect(mockUpload).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ kind: "signed_addendum" }),
      );
    });
  });

  it("is non-interactive when disabled is true", () => {
    renderDropzone({ disabled: true });
    const dropzone = screen.getByTestId("lease-attachment-dropzone");
    expect(dropzone.className).toContain("pointer-events-none");
    const kindSelect = screen.getByTestId("lease-attachment-kind-select");
    expect(kindSelect).toBeDisabled();
  });

  it("shows 413 error for files that are too large", async () => {
    mockUpload.mockReturnValue({ unwrap: () => Promise.reject({ status: 413 }) });

    renderDropzone();
    const input = document.querySelector<HTMLInputElement>("input[type='file']");
    await userEvent.upload(input!, makeFile("big.pdf"));

    await waitFor(() => {
      expect(showErrorMock).toHaveBeenCalledWith("big.pdf is too large.");
    });
  });
});
