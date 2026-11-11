/**
 * Tests for DocumentEditDialog's title: one over the backend's limit is kept, explained and not saved.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DOCUMENT_TITLE_MAX_LENGTH } from "@myjobhunter/api-client/constants/documentFieldLimits";
import type { Document } from "@myjobhunter/api-client/types/document/document";
import DocumentEditDialog from "../DocumentEditDialog";

const updateMock = vi.fn();

vi.mock("@myjobhunter/api-client/store/documentsApi", () => ({
  useUpdateDocumentMutation: () => [updateMock, { isLoading: false }],
}));

vi.mock("@platform/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@platform/ui")>();
  return { ...actual, showSuccess: vi.fn(), showError: vi.fn() };
});

const DOCUMENT: Document = {
  id: "doc-1",
  user_id: "user-1",
  application_id: null,
  title: "Cover letter",
  kind: "cover_letter",
  body: "Dear team",
  filename: null,
  content_type: null,
  size_bytes: null,
  has_file: false,
  deleted_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("DocumentEditDialog title", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateMock.mockReturnValue({ unwrap: () => Promise.resolve(DOCUMENT) });
  });

  it("keeps a title over the limit, says so, and doesn't save it", async () => {
    const user = userEvent.setup();
    render(<DocumentEditDialog document={DOCUMENT} open onOpenChange={vi.fn()} />);

    const title = screen.getByLabelText(/title/i);
    expect(title).not.toHaveAttribute("maxLength");
    fireEvent.change(title, { target: { value: "😀".repeat(DOCUMENT_TITLE_MAX_LENGTH + 1) } });

    expect(screen.getByRole("alert")).toHaveTextContent("Keep this to 255 characters or fewer.");
    expect(screen.getByText("256 / 255")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(updateMock).not.toHaveBeenCalled();

    fireEvent.change(title, { target: { value: "😀".repeat(DOCUMENT_TITLE_MAX_LENGTH) } });
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));
  });
});
