/**
 * Unit tests for DocumentUploadDialog.
 *
 * Tests:
 * - Does not render when open=false
 * - Renders when open=true
 * - Mode toggle switches between file and text
 * - Text mode: calls createDocument mutation on submit
 * - Cancel: calls onOpenChange(false) and does NOT call mutation
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DocumentUploadDialog from "../DocumentUploadDialog";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/documentsApi", () => ({
  useCreateDocumentMutation: vi.fn(),
  useUploadDocumentMutation: vi.fn(),
}));

vi.mock("@platform/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@platform/ui")>();
  return {
    ...actual,
    showSuccess: vi.fn(),
    showError: vi.fn(),
    LoadingButton: ({
      children,
      isLoading,
      type,
      onClick,
    }: {
      children: React.ReactNode;
      isLoading?: boolean;
      type?: "button" | "submit" | "reset";
      onClick?: React.MouseEventHandler<HTMLButtonElement>;
    }) => (
      <button type={type ?? "button"} disabled={isLoading} onClick={onClick}>
        {children}
      </button>
    ),
  };
});

import { useCreateDocumentMutation, useUploadDocumentMutation } from "@/lib/documentsApi";
import { showSuccess } from "@platform/ui";

const mockUseCreateDocumentMutation = vi.mocked(useCreateDocumentMutation);
const mockUseUploadDocumentMutation = vi.mocked(useUploadDocumentMutation);
const mockShowSuccess = vi.mocked(showSuccess);

function renderDialog(props: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  applicationId?: string;
} = {}) {
  const onOpenChange = props.onOpenChange ?? vi.fn();
  return {
    onOpenChange,
    ...render(
      <DocumentUploadDialog
        open={props.open ?? true}
        onOpenChange={onOpenChange}
        applicationId={props.applicationId}
      />,
    ),
  };
}

describe("DocumentUploadDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCreateDocumentMutation.mockReturnValue(
      [vi.fn(), { isLoading: false }] as unknown as ReturnType<typeof useCreateDocumentMutation>,
    );
    mockUseUploadDocumentMutation.mockReturnValue(
      [vi.fn(), { isLoading: false }] as unknown as ReturnType<typeof useUploadDocumentMutation>,
    );
  });

  it("does not render when open=false", () => {
    renderDialog({ open: false });
    expect(screen.queryByText("Add Document")).not.toBeInTheDocument();
  });

  it("renders when open=true", () => {
    renderDialog({ open: true });
    expect(screen.getByText("Add Document")).toBeInTheDocument();
  });

  it("defaults to 'Upload file' mode", () => {
    renderDialog();
    // File input should be visible
    expect(screen.getByLabelText(/file/i)).toBeInTheDocument();
    // Body textarea should NOT be visible
    expect(screen.queryByLabelText(/content/i)).not.toBeInTheDocument();
  });

  it("switches to text mode when 'Write text' is clicked", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Write text" }));

    expect(screen.getByLabelText(/content/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/file/i)).not.toBeInTheDocument();
  });

  it("calls onOpenChange(false) when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderDialog({ onOpenChange });

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("calls createDocument mutation and shows success in text mode", async () => {
    const user = userEvent.setup();
    const mockCreate = vi.fn().mockReturnValue({ unwrap: () => Promise.resolve({}) });
    mockUseCreateDocumentMutation.mockReturnValue(
      [mockCreate, { isLoading: false }] as unknown as ReturnType<typeof useCreateDocumentMutation>,
    );

    const onOpenChange = vi.fn();
    renderDialog({ onOpenChange });

    // Switch to text mode
    await user.click(screen.getByRole("button", { name: "Write text" }));

    // Fill in the form
    await user.type(screen.getByLabelText(/title/i), "My Cover Letter");
    await user.type(screen.getByLabelText(/content/i), "This is the content.");

    // Submit
    await user.click(screen.getByRole("button", { name: /create/i }));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "My Cover Letter",
          body: "This is the content.",
          kind: "cover_letter",
        }),
      );
      expect(mockShowSuccess).toHaveBeenCalledWith("Document created");
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("does not call mutation when cancel is clicked without filling the form", async () => {
    const user = userEvent.setup();
    const mockCreate = vi.fn();
    mockUseCreateDocumentMutation.mockReturnValue(
      [mockCreate, { isLoading: false }] as unknown as ReturnType<typeof useCreateDocumentMutation>,
    );

    renderDialog();

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(mockCreate).not.toHaveBeenCalled();
  });
});
