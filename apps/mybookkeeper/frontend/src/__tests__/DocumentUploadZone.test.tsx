import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { baseApi } from "@/shared/store/baseApi";
import type { RootState } from "@/shared/store/index";
import documentUploadReducer from "@/shared/store/documentUploadSlice";
import organizationReducer from "@/shared/store/organizationSlice";
import DocumentUploadZone from "@/app/features/documents/DocumentUploadZone";
import { useGetBatchStatusQuery, useGetDocumentsQuery, useGetSingleUploadStatusQuery } from "@mybookkeeper/api-client/store/documentsApi";
import { showError } from "@platform/ui";
import { DOCUMENT_UPLOAD_MESSAGES } from "@/shared/lib/document-upload-messages";
import type { DocumentStatus } from "@mybookkeeper/api-client/types/document/DocumentStatus";
import type { UploadDocumentArgs } from "@mybookkeeper/api-client/types/document/UploadDocumentArgs";

const mockUploadDocument = vi.fn(() => ({
  unwrap: () => Promise.resolve({ document_id: "doc-1", batch_id: null, batch_total: 1 }),
}));

const mockCancelBatch = vi.fn(() => ({
  unwrap: () => Promise.resolve({ cancelled: 1 }),
}));

vi.mock("@mybookkeeper/api-client/store/documentsApi", () => ({
  useUploadDocumentMutation: vi.fn(() => [mockUploadDocument, { isLoading: false }]),
  useGetBatchStatusQuery: vi.fn(() => ({ currentData: undefined })),
  useGetSingleUploadStatusQuery: vi.fn(() => ({ currentData: undefined })),
  useGetDocumentsQuery: vi.fn(() => ({ data: [] })),
  useCancelBatchMutation: vi.fn(() => [mockCancelBatch, { isLoading: false }]),
}));

vi.mock("@platform/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@platform/ui")>()),
  showError: vi.fn(),
}));

function buildTestStore(preloadedState?: Partial<RootState>) {
  return configureStore({
    reducer: {
      [baseApi.reducerPath]: baseApi.reducer,
      documentUpload: documentUploadReducer,
      organization: organizationReducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(baseApi.middleware),
    preloadedState: preloadedState as RootState | undefined,
  });
}

function renderWithStore(ui: React.ReactElement, storeOverride?: ReturnType<typeof buildTestStore>) {
  const testStore = storeOverride ?? buildTestStore();
  return render(
    <Provider store={testStore}>{ui}</Provider>,
  );
}

describe("DocumentUploadZone", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // clearAllMocks keeps queued once-implementations, so a test that stops early would leak them.
    mockUploadDocument.mockReset().mockImplementation(() => ({
      unwrap: () => Promise.resolve({ document_id: "doc-1", batch_id: null, batch_total: 1 }),
    }));
    vi.mocked(useGetDocumentsQuery).mockReturnValue({ data: [] } as unknown as ReturnType<typeof useGetDocumentsQuery>);
    vi.mocked(useGetSingleUploadStatusQuery).mockReturnValue({ currentData: undefined } as unknown as ReturnType<typeof useGetSingleUploadStatusQuery>);
    vi.mocked(useGetBatchStatusQuery).mockReturnValue({ currentData: undefined } as unknown as ReturnType<typeof useGetBatchStatusQuery>);
  });

  it("renders drag-and-drop area with browse link", () => {
    renderWithStore(<DocumentUploadZone />);

    expect(screen.getByText("browse files")).toBeInTheDocument();
    expect(screen.getByText(/browse files/)).toBeInTheDocument();
  });

  it("has a hidden file input with correct accept attribute", () => {
    renderWithStore(<DocumentUploadZone />);

    const input = document.querySelector("input[type='file']") as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.accept).toBe(".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.csv,.zip");
    expect(input.className).toContain("hidden");
  });

  it("triggers upload mutation on valid file selection", async () => {
    const user = userEvent.setup();
    renderWithStore(<DocumentUploadZone />);

    const input = document.querySelector("input[type='file']") as HTMLInputElement;
    const file = new File(["invoice content"], "invoice.pdf", { type: "application/pdf" });

    await user.upload(input, file);

    const { form } = (mockUploadDocument.mock.calls as unknown as [UploadDocumentArgs][])[0][0];
    expect(form.get("file")).toBe(file);
  });

  it("rejects empty file (size 0)", async () => {
    const user = userEvent.setup();
    renderWithStore(<DocumentUploadZone />);

    const input = document.querySelector("input[type='file']") as HTMLInputElement;
    const emptyFile = new File([], "empty.pdf", { type: "application/pdf" });

    await user.upload(input, emptyFile);

    expect(mockUploadDocument).not.toHaveBeenCalled();
  });

  it("shows uploading state with file name", async () => {
    const user = userEvent.setup();
    renderWithStore(<DocumentUploadZone />);

    const input = document.querySelector("input[type='file']") as HTMLInputElement;
    const file = new File(["data"], "receipt.pdf", { type: "application/pdf" });

    await user.upload(input, file);

    expect(screen.getByText(/receipt\.pdf/)).toBeInTheDocument();
  });

  it("shows done state after processing completes", () => {
    const storeWithDone = buildTestStore({
      documentUpload: {
        current: {
          fileName: "invoice.pdf",
          status: "done" as const,
          documentId: "doc-1",
          batchId: null,
          batchTotal: 1,
          batchFailed: 0,
          multiUploadTotal: 0,
          multiUploadCompleted: 0,
          multiUploadFailed: 0,
        },
        dragging: false,
      },
    });

    renderWithStore(<DocumentUploadZone />, storeWithDone);

    expect(screen.getByText(/Got it!/)).toBeInTheDocument();
  });

  it("shows error state with dismiss button", () => {
    const storeWithError = buildTestStore({
      documentUpload: {
        current: {
          fileName: "broken.pdf",
          status: "error" as const,
          documentId: null,
          batchId: null,
          batchTotal: 1,
          batchFailed: 0,
          multiUploadTotal: 0,
          multiUploadCompleted: 0,
          multiUploadFailed: 0,
        },
        dragging: false,
      },
    });

    renderWithStore(<DocumentUploadZone />, storeWithError);

    expect(screen.getByText(/broken\.pdf/)).toBeInTheDocument();
    expect(screen.getByTitle("Try again")).toBeInTheDocument();
  });

  it("shows processing state with spinner text", () => {
    const storeWithProcessing = buildTestStore({
      documentUpload: {
        current: {
          fileName: "doc.pdf",
          status: "processing" as const,
          documentId: "doc-1",
          batchId: null,
          batchTotal: 1,
          batchFailed: 0,
          multiUploadTotal: 0,
          multiUploadCompleted: 0,
          multiUploadFailed: 0,
        },
        dragging: false,
      },
    });

    renderWithStore(<DocumentUploadZone />, storeWithProcessing);

    expect(screen.getByText(/doc\.pdf/)).toBeInTheDocument();
  });

  it("disables drop zone during active upload", () => {
    const storeWithUploading = buildTestStore({
      documentUpload: {
        current: {
          fileName: "uploading.pdf",
          status: "uploading" as const,
          documentId: null,
          batchId: null,
          batchTotal: 1,
          batchFailed: 0,
          multiUploadTotal: 0,
          multiUploadCompleted: 0,
          multiUploadFailed: 0,
        },
        dragging: false,
      },
    });

    renderWithStore(<DocumentUploadZone />, storeWithUploading);

    const browse = screen.getByText("browse files");
    expect(browse).toBeDisabled();
  });

  describe("when a single upload's extraction ends", () => {
    function processingStore() {
      return buildTestStore({
        documentUpload: {
          current: {
            fileName: "invoice.pdf",
            status: "processing" as const,
            documentId: "doc-1",
            batchId: null,
            batchTotal: 1,
            batchFailed: 0,
            multiUploadTotal: 0,
            multiUploadCompleted: 0,
            multiUploadFailed: 0,
          },
          dragging: false,
        },
      });
    }

    function renderEndingIn(status: DocumentStatus) {
      vi.mocked(useGetSingleUploadStatusQuery).mockReturnValue({ currentData: { status } } as unknown as ReturnType<typeof useGetSingleUploadStatusQuery>);
      renderWithStore(<DocumentUploadZone />, processingStore());
    }

    it("says it got the data when extraction completed", async () => {
      renderEndingIn("completed");
      expect(await screen.findByText(/Got it! Check your Transactions page/)).toBeInTheDocument();
    });

    it("says it had trouble, not that it got it, when extraction failed", async () => {
      renderEndingIn("failed");
      expect(await screen.findByText(/I had trouble reading this one/)).toBeInTheDocument();
      expect(screen.queryByText(/Got it!/)).not.toBeInTheDocument();
      expect(screen.getByTitle("Dismiss")).toBeInTheDocument();
    });

    it.each(["duplicate", "skipped", "deleted"] as const)("says nothing new was added when the document ends %s", async (status) => {
      renderEndingIn(status);
      expect(await screen.findByText(/nothing new to add to your transactions/)).toBeInTheDocument();
      expect(screen.queryByText(/Got it!/)).not.toBeInTheDocument();
    });

    it("keeps reading a new upload when only the previous upload's status is cached", () => {
      // RTK Query keeps the last result in `data` after the document id changes;
      // `currentData` is empty until this document's own status arrives.
      vi.mocked(useGetSingleUploadStatusQuery).mockReturnValue({
        data: { status: "failed" },
        currentData: undefined,
      } as unknown as ReturnType<typeof useGetSingleUploadStatusQuery>);
      renderWithStore(<DocumentUploadZone />, processingStore());
      expect(screen.getByText(/Processing…/)).toBeInTheDocument();
      expect(screen.queryByText(/I had trouble reading this one/)).not.toBeInTheDocument();
    });

    it("keeps reading while the document is still being extracted", () => {
      renderEndingIn("extracting");
      expect(screen.getByText(/let me read this/)).toBeInTheDocument();
    });
  });

  describe("when a batch finishes", () => {
    function renderBatchEnding(failed: number, inProgress = 0) {
      const status = { batch_id: "batch-1", total: 3, completed: 3 - inProgress, failed, status: inProgress ? "processing" : "done" };
      // The real query is skipped once the upload stops processing, so the card
      // must keep the counts itself.
      vi.mocked(useGetBatchStatusQuery).mockImplementation(((_id: string, opts?: { skip?: boolean }) => ({
        currentData: opts?.skip ? undefined : status,
      })) as unknown as typeof useGetBatchStatusQuery);
      renderWithStore(<DocumentUploadZone />, buildTestStore({
        documentUpload: {
          current: {
            fileName: "3 files",
            status: "processing" as const,
            documentId: "doc-1",
            batchId: "batch-1",
            batchTotal: 3,
            batchFailed: 0,
            multiUploadTotal: 0,
            multiUploadCompleted: 0,
            multiUploadFailed: 0,
          },
          dragging: false,
        },
      }));
    }

    it("says every document was processed when none failed", async () => {
      renderBatchEnding(0);
      expect(await screen.findByText("3 files — 3 documents processed")).toBeInTheDocument();
      expect(screen.queryByLabelText("Some files failed")).not.toBeInTheDocument();
    });

    it("counts the failed documents instead of calling them processed", async () => {
      renderBatchEnding(1);
      expect(await screen.findByText("3 files — I read 2 of 3, but had trouble with 1. Want me to try that one again? It's in the list below.")).toBeInTheDocument();
      expect(screen.getByLabelText("Some files failed")).toBeInTheDocument();
    });

    it("says how many it had trouble with when more than one failed", async () => {
      renderBatchEnding(2);
      expect(await screen.findByText(/I read 1 of 3, but had trouble with 2\. Want me to try those again\? They're in the list below\./)).toBeInTheDocument();
    });

    it("says it had trouble, not that it finished, when every document failed", async () => {
      renderBatchEnding(3);
      expect(await screen.findByText(/I had trouble reading all 3 of these/)).toHaveClass("text-destructive");
      expect(screen.queryByText(/processed/)).not.toBeInTheDocument();
      expect(screen.getByTitle("Dismiss")).toBeInTheDocument();
    });

    it("does not count failed documents as extracted while the batch is still reading", () => {
      renderBatchEnding(1, 1);
      expect(screen.getByText("3 files — 1 of 3 extracted (1 failed)…")).toBeInTheDocument();
    });
  });

  describe("when several files are uploaded", () => {
    async function uploadTwo() {
      const user = userEvent.setup();
      renderWithStore(<DocumentUploadZone />);
      const input = document.querySelector("input[type='file']") as HTMLInputElement;
      await user.upload(input, [
        new File(["a"], "a.pdf", { type: "application/pdf" }),
        new File(["b"], "b.pdf", { type: "application/pdf" }),
      ]);
    }

    it("counts a failed upload and warns about it", async () => {
      mockUploadDocument.mockReturnValueOnce({ unwrap: () => Promise.reject(new Error("413")) });
      await uploadTwo();
      expect(await screen.findByText("2 files — 1 of 2 uploaded (1 failed)")).toBeInTheDocument();
      expect(screen.getByLabelText("Some files failed")).toBeInTheDocument();
    });

    it("says it couldn't upload any, not that it finished, when every upload failed", async () => {
      const reject = () => ({ unwrap: () => Promise.reject(new Error("network")) });
      mockUploadDocument.mockImplementationOnce(reject).mockImplementationOnce(reject);
      await uploadTwo();
      expect(await screen.findByText(/I couldn't upload any of these/)).toHaveClass("text-destructive");
      expect(screen.queryByText(/uploaded/)).not.toBeInTheDocument();
    });
  });

  it("restores a zip that was still being read when the page reloaded", () => {
    vi.mocked(useGetDocumentsQuery).mockReturnValue({
      data: [
        { id: "doc-1", status: "processing", source: "upload", batch_id: "batch-1", file_name: "a.pdf" },
        { id: "doc-2", status: "processing", source: "upload", batch_id: "batch-1", file_name: "b.pdf" },
      ],
    } as unknown as ReturnType<typeof useGetDocumentsQuery>);
    renderWithStore(<DocumentUploadZone />);
    expect(screen.getByText("Your zip — Processing…")).toBeInTheDocument();
  });

  describe("cancelling a batch", () => {
    it("keeps the batch on screen and says so when the cancel fails", async () => {
      vi.mocked(useGetBatchStatusQuery).mockReturnValue({
        currentData: { batch_id: "batch-1", total: 3, completed: 1, failed: 0, status: "processing" },
      } as unknown as ReturnType<typeof useGetBatchStatusQuery>);
      mockCancelBatch.mockReturnValueOnce({ unwrap: () => Promise.reject(new Error("network")) });
      renderWithStore(<DocumentUploadZone />, buildTestStore({
        documentUpload: {
          current: {
            fileName: "3 files",
            status: "processing" as const,
            documentId: "doc-1",
            batchId: "batch-1",
            batchTotal: 3,
            batchFailed: 0,
            multiUploadTotal: 0,
            multiUploadCompleted: 0,
            multiUploadFailed: 0,
          },
          dragging: false,
        },
      }));

      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

      await waitFor(() => expect(showError).toHaveBeenCalledWith(DOCUMENT_UPLOAD_MESSAGES.CANCEL_FAILED));
      expect(screen.getByText(/1 of 3 extracted/)).toBeInTheDocument();
    });
  });
});
