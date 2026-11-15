import "@platform/mobile/test-support/reactNativeFormData";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import type { AxiosAdapter } from "axios";
import { drainUploadQueue } from "../src/features/capture/drainUploadQueue";
import { addToQueue } from "../src/features/capture/uploadQueueFiles";
import { uploadFileChanged, uploadFilesQueued, uploadPhaseChanged, uploadRejected, uploadsReset, uploadStatusDismissed } from "../src/features/capture/uploadsSlice";
import { switchWorkspace } from "../src/features/workspace/switchWorkspace";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { fakeFiles, resetFakeFiles } from "@platform/mobile/test-support/fakeFileSystem";

jest.mock("expo-file-system", () => jest.requireActual("@platform/mobile/test-support/fakeFileSystem"));
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn() }));
jest.mock("../src/features/aiPermission/aiPermission", () => ({
  ...jest.requireActual("../src/features/aiPermission/aiPermission"),
  hasAiPermission: () => true,
}));

const originalAdapter = api.defaults.adapter;
const SOURCE = "doc:/source.jpg";
/** What switchWorkspace does to the uploads, without cancelling the request that's mid-flight. */
function switchLeavingRequestAlive(workspaceId: string): void {
  store.dispatch(workspaceChosen(workspaceId));
  store.dispatch(uploadsReset());
}

const IDLE = { phase: "idle", rejections: [], files: [] };

function addFile(workspaceId: string, name: string): void {
  resetFakeFiles([...fakeFiles(), SOURCE]);
  addToQueue(workspaceId, SOURCE, name);
}

beforeEach(() => {
  resetFakeFiles();
  session.tokenStore.set("token");
  store.dispatch(baseApi.util.resetApiState());
  store.dispatch(workspaceChosen("w1"));
  store.dispatch(uploadStatusDismissed());
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
});

describe("switching workspace", () => {
  it("leaves the new workspace with none of the old one's upload status", async () => {
    store.dispatch(uploadFilesQueued([{ uri: "doc:/a.jpg", name: "a.jpg", mimeType: "image/jpeg" }]));
    store.dispatch(uploadFileChanged({ uri: "doc:/a.jpg", status: "failed" }));
    store.dispatch(uploadRejected("a.jpg isn't a file we can read"));
    store.dispatch(uploadPhaseChanged("unreachable"));

    store.dispatch(switchWorkspace("w2", []));
    await store.dispatch(drainUploadQueue());

    expect(store.getState().workspace.activeId).toBe("w2");
    expect(store.getState().uploads).toEqual(IDLE);
  });

  it("doesn't put a send's failure into the new workspace when it answers after the switch", async () => {
    addFile("w1", "a.jpg");
    const adapter: AxiosAdapter = (config) => {
      switchLeavingRequestAlive("w2");
      const response = { data: { detail: "Unsupported file type" }, status: 415, statusText: "", headers: {}, config };
      return Promise.reject(Object.assign(new Error("415"), { config, response, isAxiosError: true }));
    };
    api.defaults.adapter = adapter;

    await store.dispatch(drainUploadQueue());

    expect(store.getState().uploads).toEqual(IDLE);
  });

  it("doesn't show the old workspace's finished send under the new one", async () => {
    addFile("w1", "a.jpg");
    const adapter: AxiosAdapter = (config) => {
      switchLeavingRequestAlive("w2");
      return Promise.resolve({ data: { document_id: "d" }, status: 202, statusText: "", headers: {}, config });
    };
    api.defaults.adapter = adapter;

    await store.dispatch(drainUploadQueue());

    expect(store.getState().uploads).toEqual(IDLE);
  });
});
