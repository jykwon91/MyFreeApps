import { describe, expect, it } from "vitest";
import reducer, {
  batchProcessed,
  multiUploadDone,
  multiUploadFileCompleted,
  multiUploadFileFailed,
  startMultiUpload,
  startUpload,
  uploadSucceeded,
} from "@/shared/store/documentUploadSlice";
import { FILE_STATUSES } from "@/shared/types/document/file-status";

function batchProcessing() {
  let state = reducer(undefined, startUpload("receipts.zip"));
  state = reducer(state, uploadSucceeded({ documentId: "doc-1", batchId: "batch-1", batchTotal: 3 }));
  return state;
}

describe("documentUploadSlice", () => {
  describe("batchProcessed", () => {
    it("finishes the batch when some documents were read", () => {
      const state = reducer(batchProcessing(), batchProcessed({ total: 3, failed: 2 }));
      expect(state.current).toMatchObject({ status: FILE_STATUSES.DONE, batchTotal: 3, batchFailed: 2 });
    });

    it("does not fail a batch left with no documents, as when a cancel lands mid-poll", () => {
      const state = reducer(batchProcessing(), batchProcessed({ total: 0, failed: 0 }));
      expect(state.current?.status).toBe(FILE_STATUSES.DONE);
    });

    it("fails the batch when every document failed", () => {
      const state = reducer(batchProcessing(), batchProcessed({ total: 3, failed: 3 }));
      expect(state.current).toMatchObject({ status: FILE_STATUSES.FAILED, batchFailed: 3 });
    });
  });

  it("starts the next upload without the last batch's failures", () => {
    const failed = reducer(batchProcessing(), batchProcessed({ total: 3, failed: 3 }));
    expect(reducer(failed, startUpload("next.pdf")).current?.batchFailed).toBe(0);
  });

  describe("multiUploadDone", () => {
    it("finishes when at least one file uploaded", () => {
      let state = reducer(undefined, startMultiUpload({ total: 2 }));
      state = reducer(state, multiUploadFileCompleted());
      state = reducer(state, multiUploadFileFailed());
      state = reducer(state, multiUploadDone());
      expect(state.current?.status).toBe(FILE_STATUSES.DONE);
    });

    it("fails when no file uploaded", () => {
      let state = reducer(undefined, startMultiUpload({ total: 2 }));
      state = reducer(state, multiUploadFileFailed());
      state = reducer(state, multiUploadFileFailed());
      state = reducer(state, multiUploadDone());
      expect(state.current?.status).toBe(FILE_STATUSES.FAILED);
    });
  });
});
