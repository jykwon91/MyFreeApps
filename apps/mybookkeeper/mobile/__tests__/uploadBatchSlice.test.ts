import reducer, {
  uploadBatchCancelled,
  uploadBatchStarted,
  uploadDrainEnded,
  uploadFileChanged,
  uploadFilesQueued,
  uploadPhaseChanged,
  uploadSentSettled,
  uploadStatusDismissed,
} from "../src/features/capture/uploadsSlice";
import type { UploadsState } from "../src/types/UploadsState";

function withZipBeingRead(): UploadsState {
  let state = reducer(undefined, uploadFilesQueued([
    { uri: "q:/receipts.zip", name: "receipts.zip", mimeType: "application/zip" },
    { uri: "q:/bank.csv", name: "bank.csv", mimeType: "text/csv" },
  ]));
  state = reducer(state, uploadBatchStarted({ uri: "q:/receipts.zip", batchId: "batch-1" }));
  return reducer(state, uploadFileChanged({ uri: "q:/bank.csv", status: "done" }));
}

describe("a zip being read in the upload list", () => {
  it("is kept when sending ends, and when the got-it message settles, so it can still be stopped", () => {
    let state = reducer(withZipBeingRead(), uploadDrainEnded(true));
    state = reducer(reducer(state, uploadPhaseChanged("sent")), uploadSentSettled());
    expect(state.files).toEqual([{ uri: "q:/receipts.zip", name: "receipts.zip", status: "reading", percent: null, batchId: "batch-1" }]);
  });

  it("is kept when a message is dismissed", () => {
    const state = reducer(reducer(withZipBeingRead(), uploadPhaseChanged("limitReached")), uploadStatusDismissed());
    expect(state.files.map((file) => file.name)).toEqual(["receipts.zip"]);
  });

  it("shows as cancelled once stopped, and then settles away", () => {
    let state = reducer(withZipBeingRead(), uploadBatchCancelled("q:/receipts.zip"));
    expect(state.files[0]).toMatchObject({ status: "cancelled", batchId: null });
    state = reducer(state, uploadSentSettled());
    expect(state.files).toEqual([]);
  });
});
