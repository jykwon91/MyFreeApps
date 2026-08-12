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
 * - Picking reads immediately — no second button to press
 * - An empty library hides the picker rather than showing an empty one
 * - Each way a read can fail says something the operator can act on, and the
 *   failed document can be retried without being picked again
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

/** Mutable so a test can hold the read open and inspect the in-flight state. */
const uploadState = vi.hoisted(() => ({ isLoading: false }));

vi.mock("@/shared/store/utilityPlansApi", () => ({
  useExtractUtilityPlanMutation: vi.fn(() => [mockExtract, { isLoading: false }]),
  useExtractUtilityPlanFromUploadMutation: vi.fn(() => [mockExtractUpload, uploadState]),
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
  uploadState.isLoading = false;
  withLibrary([{ id: "doc-1", file_name: "constellation-efl.pdf" }]);
  mockExtract.mockReturnValue({ unwrap: vi.fn().mockResolvedValue(DRAFT) });
  mockExtractUpload.mockReturnValue({ unwrap: vi.fn().mockResolvedValue(DRAFT) });
});

describe("UtilityPlanDocumentReader — reading a file off the device", () => {
  it("reads a file the operator picked without a trip to the Documents page", async () => {
    const user = userEvent.setup();
    const onRead = renderReader();

    await pickFile(user);

    await waitFor(() => expect(onRead).toHaveBeenCalledWith(DRAFT));
    expect(mockExtractUpload).toHaveBeenCalledWith(EFL);
    expect(mockExtract).not.toHaveBeenCalled();
  });

  it("reads on pick rather than waiting to be asked a second time", async () => {
    // Picking a document had exactly one sensible next step, so pressing a
    // button to confirm it was a step that never carried a decision.
    const user = userEvent.setup();
    renderReader();

    await pickFile(user);

    await waitFor(() => expect(mockExtractUpload).toHaveBeenCalled());
    expect(
      screen.queryByTestId("utility-plan-read-document-button"),
    ).not.toBeInTheDocument();
  });

  it("shows which file it is reading", async () => {
    const user = userEvent.setup();
    renderReader();

    await pickFile(user);

    expect(screen.getByTestId("utility-plan-chosen-document")).toHaveTextContent(
      "rhythm-efl.pdf",
    );
  });

  it("says it is reading while the read is in flight", async () => {
    const user = userEvent.setup();
    uploadState.isLoading = true;
    mockExtractUpload.mockReturnValue({ unwrap: vi.fn(() => new Promise(() => {})) });
    renderReader();

    await pickFile(user);

    expect(screen.getByTestId("utility-plan-reading-indicator")).toBeInTheDocument();
    // Swapping the document out mid-read would race the response about to
    // fill the form, so the way to do that is gone until it settles.
    expect(
      screen.queryByTestId("utility-plan-clear-document-button"),
    ).not.toBeInTheDocument();
  });

  it("lets the operator swap the file back out once the read has settled", async () => {
    const user = userEvent.setup();
    renderReader();

    await pickFile(user);
    await user.click(screen.getByTestId("utility-plan-clear-document-button"));

    expect(screen.queryByTestId("utility-plan-chosen-document")).not.toBeInTheDocument();
    expect(screen.getByTestId("utility-plan-file-dropzone")).toBeInTheDocument();
  });

  it("reads nothing on its own before anything is picked", async () => {
    renderReader();

    expect(mockExtractUpload).not.toHaveBeenCalled();
    expect(mockExtract).not.toHaveBeenCalled();
    expect(
      screen.queryByTestId("utility-plan-read-document-button"),
    ).not.toBeInTheDocument();
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

    await waitFor(() => expect(showError).toHaveBeenCalled());
    expect(vi.mocked(showError).mock.calls[0][0]).toContain(expected);
  });

  it("offers to retry the same document rather than making it be picked again", async () => {
    const user = userEvent.setup();
    mockExtractUpload.mockReturnValue({
      unwrap: vi.fn().mockRejectedValue({ status: 500 }),
    });
    const onRead = renderReader();

    await pickFile(user);
    await waitFor(() => expect(showError).toHaveBeenCalled());

    expect(screen.getByTestId("utility-plan-chosen-document")).toHaveTextContent(
      "rhythm-efl.pdf",
    );

    mockExtractUpload.mockReturnValue({ unwrap: vi.fn().mockResolvedValue(DRAFT) });
    await user.click(screen.getByTestId("utility-plan-read-document-button"));

    await waitFor(() => expect(onRead).toHaveBeenCalledWith(DRAFT));
    expect(mockExtractUpload).toHaveBeenCalledTimes(2);
  });

  it("takes the retry button away again once the read succeeds", async () => {
    const user = userEvent.setup();
    mockExtractUpload.mockReturnValue({
      unwrap: vi.fn().mockRejectedValue({ status: 500 }),
    });
    renderReader();

    await pickFile(user);
    await waitFor(() =>
      expect(screen.getByTestId("utility-plan-read-document-button")).toBeInTheDocument(),
    );

    mockExtractUpload.mockReturnValue({ unwrap: vi.fn().mockResolvedValue(DRAFT) });
    await user.click(screen.getByTestId("utility-plan-read-document-button"));

    await waitFor(() =>
      expect(
        screen.queryByTestId("utility-plan-read-document-button"),
      ).not.toBeInTheDocument(),
    );
  });
});
