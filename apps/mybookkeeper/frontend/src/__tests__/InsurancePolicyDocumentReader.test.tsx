/**
 * Unit tests for getting a declarations page into the insurance-policy form.
 *
 * A dec page has nine fields on it that the operator would otherwise retype
 * from a PDF on a second screen — carrier, policy number, both dates, the
 * dwelling limit, the premium and its period, and two deductibles. Every one
 * of those is a chance to transpose a digit into a comparison that then tells
 * them they are or are not overpaying.
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
import InsurancePolicyDocumentReader from "@/app/features/insurance/InsurancePolicyDocumentReader";
import { showError } from "@/shared/lib/toast-store";
import type { InsurancePolicyDraft } from "@/shared/types/insurance/insurance-policy-draft";

// ── Mocks ───────────────────────────────────────────────────────────────────

const mockExtract = vi.fn();
const mockExtractUpload = vi.fn();
const mockUseGetDocuments = vi.fn();

/** Mutable so a test can hold the read open and inspect the in-flight state. */
const uploadState = vi.hoisted(() => ({ isLoading: false }));

vi.mock("@/shared/store/insurancePoliciesApi", () => ({
  useExtractInsurancePolicyMutation: vi.fn(() => [mockExtract, { isLoading: false }]),
  useExtractInsurancePolicyFromUploadMutation: vi.fn(() => [
    mockExtractUpload,
    uploadState,
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

const DRAFT = {
  source_document_id: "doc-9",
  confidence: "high",
} as InsurancePolicyDraft;

const DEC_PAGE = new File(["%PDF-1.4"], "peerless-dec-page.pdf", {
  type: "application/pdf",
});

function renderReader(onRead = vi.fn()) {
  render(<InsurancePolicyDocumentReader onRead={onRead} />);
  return onRead;
}

function withLibrary(documents: { id: string; file_name: string }[]) {
  mockUseGetDocuments.mockReturnValue({ data: documents });
}

async function pickFile(user: ReturnType<typeof userEvent.setup>, file = DEC_PAGE) {
  await user.upload(screen.getByTestId("insurance-policy-file-input"), file);
}

beforeEach(() => {
  vi.clearAllMocks();
  uploadState.isLoading = false;
  withLibrary([{ id: "doc-1", file_name: "texas-mutual-dec.pdf" }]);
  mockExtract.mockReturnValue({ unwrap: vi.fn().mockResolvedValue(DRAFT) });
  mockExtractUpload.mockReturnValue({ unwrap: vi.fn().mockResolvedValue(DRAFT) });
});

describe("InsurancePolicyDocumentReader — reading a file off the device", () => {
  it("reads a file the operator picked without a trip to the Documents page", async () => {
    const user = userEvent.setup();
    const onRead = renderReader();

    await pickFile(user);

    await waitFor(() => expect(onRead).toHaveBeenCalledWith(DRAFT));
    expect(mockExtractUpload).toHaveBeenCalledWith(DEC_PAGE);
    expect(mockExtract).not.toHaveBeenCalled();
  });

  it("reads on pick rather than waiting to be asked a second time", async () => {
    const user = userEvent.setup();
    renderReader();

    await pickFile(user);

    await waitFor(() => expect(mockExtractUpload).toHaveBeenCalled());
    expect(
      screen.queryByTestId("insurance-policy-read-document-button"),
    ).not.toBeInTheDocument();
  });

  it("says it is reading while the read is in flight", async () => {
    const user = userEvent.setup();
    uploadState.isLoading = true;
    mockExtractUpload.mockReturnValue({ unwrap: vi.fn(() => new Promise(() => {})) });
    renderReader();

    await pickFile(user);

    expect(
      screen.getByTestId("insurance-policy-reading-indicator"),
    ).toBeInTheDocument();
    // Swapping the document out mid-read would race the response about to
    // fill the form, so the way to do that is gone until it settles.
    expect(
      screen.queryByTestId("insurance-policy-clear-document-button"),
    ).not.toBeInTheDocument();
  });

  it("reads nothing on its own before anything is picked", () => {
    renderReader();

    expect(mockExtractUpload).not.toHaveBeenCalled();
    expect(mockExtract).not.toHaveBeenCalled();
  });
});

describe("InsurancePolicyDocumentReader — the document library", () => {
  it("offers no picker when there is nothing to pick", () => {
    withLibrary([]);
    renderReader();

    expect(
      screen.queryByTestId("insurance-policy-library-picker"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("insurance-policy-file-dropzone")).toBeInTheDocument();
  });

  it("still reads a dec page already in the library", async () => {
    const user = userEvent.setup();
    const onRead = renderReader();

    await user.selectOptions(
      screen.getByTestId("insurance-policy-document-select"),
      "doc-1",
    );

    await waitFor(() => expect(onRead).toHaveBeenCalledWith(DRAFT));
    expect(mockExtract).toHaveBeenCalledWith({ document_id: "doc-1" });
    expect(mockExtractUpload).not.toHaveBeenCalled();
  });
});

describe("InsurancePolicyDocumentReader — when a read fails", () => {
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

    expect(screen.getByTestId("insurance-policy-chosen-document")).toHaveTextContent(
      "peerless-dec-page.pdf",
    );

    mockExtractUpload.mockReturnValue({ unwrap: vi.fn().mockResolvedValue(DRAFT) });
    await user.click(screen.getByTestId("insurance-policy-read-document-button"));

    await waitFor(() => expect(onRead).toHaveBeenCalledWith(DRAFT));
    expect(mockExtractUpload).toHaveBeenCalledTimes(2);
  });
});
