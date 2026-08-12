/**
 * Unit tests for getting a document into the utility-plan form.
 *
 * The bug these close: the card offered a dropdown of the document library and
 * nothing else, so anyone whose Electricity Facts Label was still on their
 * phone — which is most people, on the device where this dialog is mostly
 * opened — hit a dead end. It told them to go and upload it somewhere else
 * first, and on an empty library the dropdown had nothing in it at all.
 *
 * Verifies:
 * - A file picked on the device is read without visiting the Documents page
 * - Nothing is uploaded until the read is actually asked for
 * - An empty library hides the picker rather than showing an empty one
 * - Each way a read can fail says something the operator can act on
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import UtilityPlanDocumentReader from "@/app/features/utility/UtilityPlanDocumentReader";
import { showError } from "@/shared/lib/toast-store";
import type { UtilityPlanDraft } from "@/shared/types/utility/utility-plan-draft";

// ── Mocks ───────────────────────────────────────────────────────────────────

const mockExtract = vi.fn();
const mockExtractUpload = vi.fn();
const mockUseGetDocuments = vi.fn();

vi.mock("@/shared/store/utilityPlansApi", () => ({
  useExtractUtilityPlanMutation: vi.fn(() => [mockExtract, { isLoading: false }]),
  useExtractUtilityPlanFromUploadMutation: vi.fn(() => [
    mockExtractUpload,
    { isLoading: false },
  ]),
}));

vi.mock("@/shared/store/documentsApi", () => ({
  useGetDocumentsQuery: (...args: unknown[]) => mockUseGetDocuments(...args),
}));

vi.mock("@/shared/lib/toast-store", () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

// ── Test data ────────────────────────────────────────────────────────────────

const DRAFT = { source_document_id: "doc-9", confidence: "high" } as UtilityPlanDraft;

const EFL = new File(["%PDF-1.4"], "rhythm-efl.pdf", { type: "application/pdf" });

function renderReader(onRead = vi.fn()) {
  render(<UtilityPlanDocumentReader onRead={onRead} />);
  return onRead;
}

function withLibrary(documents: { id: string; file_name: string }[]) {
  mockUseGetDocuments.mockReturnValue({ data: documents });
}

async function pickFile(user: ReturnType<typeof userEvent.setup>, file = EFL) {
  await user.upload(screen.getByTestId("utility-plan-file-input"), file);
}

beforeEach(() => {
  vi.clearAllMocks();
  withLibrary([{ id: "doc-1", file_name: "constellation-efl.pdf" }]);
  mockExtract.mockReturnValue({ unwrap: vi.fn().mockResolvedValue(DRAFT) });
  mockExtractUpload.mockReturnValue({ unwrap: vi.fn().mockResolvedValue(DRAFT) });
});

describe("UtilityPlanDocumentReader — reading a file off the device", () => {
  it("reads a file the operator picked without a trip to the Documents page", async () => {
    const user = userEvent.setup();
    const onRead = renderReader();

    await pickFile(user);
    await user.click(screen.getByTestId("utility-plan-read-document-button"));

    await waitFor(() => expect(onRead).toHaveBeenCalledWith(DRAFT));
    expect(mockExtractUpload).toHaveBeenCalledWith(EFL);
    expect(mockExtract).not.toHaveBeenCalled();
  });

  it("shows which file it is about to read", async () => {
    const user = userEvent.setup();
    renderReader();

    await pickFile(user);

    expect(screen.getByTestId("utility-plan-chosen-document")).toHaveTextContent(
      "rhythm-efl.pdf",
    );
  });

  it("uploads nothing until the read is asked for", async () => {
    // Picking a file and then abandoning the dialog must not leave a document
    // behind — the upload happens inside the read, not on selection.
    const user = userEvent.setup();
    renderReader();

    await pickFile(user);

    expect(mockExtractUpload).not.toHaveBeenCalled();
  });

  it("lets the operator swap the file back out", async () => {
    const user = userEvent.setup();
    renderReader();

    await pickFile(user);
    await user.click(screen.getByTestId("utility-plan-clear-document-button"));

    expect(screen.queryByTestId("utility-plan-chosen-document")).not.toBeInTheDocument();
    expect(screen.getByTestId("utility-plan-file-dropzone")).toBeInTheDocument();
    expect(screen.getByTestId("utility-plan-read-document-button")).toBeDisabled();
  });

  it("does not read anything until something is chosen", async () => {
    const user = userEvent.setup();
    renderReader();

    await user.click(screen.getByTestId("utility-plan-read-document-button"));

    expect(mockExtractUpload).not.toHaveBeenCalled();
    expect(mockExtract).not.toHaveBeenCalled();
  });
});

describe("UtilityPlanDocumentReader — the document library", () => {
  it("offers no picker when there is nothing to pick", async () => {
    // The reported symptom: a dropdown whose only entry was "Select a
    // document…". An empty control is worse than no control.
    withLibrary([]);
    renderReader();

    expect(screen.queryByTestId("utility-plan-library-picker")).not.toBeInTheDocument();
    expect(screen.getByTestId("utility-plan-file-dropzone")).toBeInTheDocument();
  });

  it("still reads a document already in the library", async () => {
    const user = userEvent.setup();
    const onRead = renderReader();

    await user.selectOptions(
      screen.getByTestId("utility-plan-document-select"),
      "doc-1",
    );
    await user.click(screen.getByTestId("utility-plan-read-document-button"));

    await waitFor(() => expect(onRead).toHaveBeenCalledWith(DRAFT));
    expect(mockExtract).toHaveBeenCalledWith({ document_id: "doc-1" });
    expect(mockExtractUpload).not.toHaveBeenCalled();
  });

  it("names the picked library document the same way an uploaded one is named", async () => {
    const user = userEvent.setup();
    renderReader();

    await user.selectOptions(
      screen.getByTestId("utility-plan-document-select"),
      "doc-1",
    );

    expect(screen.getByTestId("utility-plan-chosen-document")).toHaveTextContent(
      "constellation-efl.pdf",
    );
  });
});

describe("UtilityPlanDocumentReader — when a read fails", () => {
  it.each([
    [413, "10MB"],
    [415, "PDF or a photo"],
    [429, "today"],
    [422, "fill it in by hand"],
  ])("tells the operator what to do about a %i", async (status, expected) => {
    const user = userEvent.setup();
    mockExtractUpload.mockReturnValue({
      unwrap: vi.fn().mockRejectedValue({ status }),
    });
    renderReader();

    await pickFile(user);
    await user.click(screen.getByTestId("utility-plan-read-document-button"));

    await waitFor(() => expect(showError).toHaveBeenCalled());
    expect(vi.mocked(showError).mock.calls[0][0]).toContain(expected);
  });

  it("keeps the chosen file so a retry does not start from scratch", async () => {
    const user = userEvent.setup();
    mockExtractUpload.mockReturnValue({
      unwrap: vi.fn().mockRejectedValue({ status: 500 }),
    });
    renderReader();

    await pickFile(user);
    await user.click(screen.getByTestId("utility-plan-read-document-button"));

    await waitFor(() => expect(showError).toHaveBeenCalled());
    expect(screen.getByTestId("utility-plan-chosen-document")).toHaveTextContent(
      "rhythm-efl.pdf",
    );
  });
});
