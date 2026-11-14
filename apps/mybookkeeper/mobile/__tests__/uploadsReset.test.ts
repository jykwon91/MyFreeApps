import { onAccountLeft } from "@platform/mobile";
import { resetFakeFiles } from "@platform/mobile/test-support/fakeFileSystem";
import {
  uploadFileChanged,
  uploadFileProgressed,
  uploadFilesQueued,
  uploadPhaseChanged,
  uploadRejected,
  uploadsReset,
} from "../src/features/capture/uploadsSlice";
import { store } from "../src/lib/store";

jest.mock("@platform/mobile", () => ({
  ...jest.requireActual("@platform/mobile"),
  onAccountLeft: jest.fn(),
}));
jest.mock("expo-file-system", () => jest.requireActual("@platform/mobile/test-support/fakeFileSystem"));

const EMPTY = { phase: "idle", rejections: [], files: [] };
const accountLeft = jest.mocked(onAccountLeft).mock.calls[0]![1];

/** Mid-send, with one file refused: everything the list can be holding. */
function fillUploads(): void {
  store.dispatch(uploadPhaseChanged("sending"));
  store.dispatch(uploadRejected("notes.txt was turned away"));
  store.dispatch(uploadFilesQueued([{ uri: "q:/a", name: "a.pdf", mimeType: "application/pdf" }, { uri: "q:/b", name: "b.csv", mimeType: "text/csv" }]));
  store.dispatch(uploadFileChanged({ uri: "q:/a", status: "uploading" }));
}

beforeEach(() => {
  resetFakeFiles();
  store.dispatch(uploadsReset());
});

describe("uploadsReset", () => {
  it("clears the files, the refusals and the phase, even mid-send", () => {
    fillUploads();
    store.dispatch(uploadsReset());
    expect(store.getState().uploads).toEqual(EMPTY);
  });

  it("ignores progress that arrives late for a file no longer listed", () => {
    fillUploads();
    store.dispatch(uploadsReset());
    store.dispatch(uploadFileProgressed({ uri: "q:/a", percent: 40 }));
    store.dispatch(uploadFileChanged({ uri: "q:/a", status: "done" }));
    expect(store.getState().uploads).toEqual(EMPTY);
  });

  it("runs when the account leaves the phone, so the next person sees none of it", () => {
    fillUploads();
    accountLeft();
    expect(store.getState().uploads).toEqual(EMPTY);
  });
});
