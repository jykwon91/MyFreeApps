import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { baseApi } from "@/shared/store/baseApi";
import type { RootState } from "@/shared/store/index";
import documentUploadReducer from "@/shared/store/documentUploadSlice";
import organizationReducer from "@/shared/store/organizationSlice";
import DocumentUploadZone from "@/app/features/documents/DocumentUploadZone";

const mockUploadDocument = vi.fn(() => ({
  unwrap: () => Promise.resolve({ document_id: "doc-1", batch_id: null, batch_total: 1 }),
}));

const mockCancelBatch = vi.fn(() => ({
  unwrap: () => Promise.resolve({ cancelled: 1 }),
}));

vi.mock("@/shared/store/documentsApi", () => ({
  useUploadDocumentMutation: vi.fn(() => [mockUploadDocument, { isLoading: false }]),
  useGetBatchStatusQuery: vi.fn(() => ({ data: undefined })),
  useGetSingleUploadStatusQuery: vi.fn(() => ({ data: undefined })),
  useGetDocumentsQuery: vi.fn(() => ({ data: [] })),
  useCancelBatchMutation: vi.fn(() => [mockCancelBatch]),
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

    expect(mockUploadDocument).toHaveBeenCalledWith({ file });
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
});
