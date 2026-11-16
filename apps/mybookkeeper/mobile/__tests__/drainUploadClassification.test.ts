import "@platform/mobile/test-support/reactNativeFormData";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import type { AxiosAdapter } from "axios";
import { fakeFiles, resetFakeFiles } from "@platform/mobile/test-support/fakeFileSystem";
import { drainUploadQueue } from "../src/features/capture/drainUploadQueue";
import { addToQueue, clearUploadQueue, pendingUploads } from "../src/features/capture/uploadQueueFiles";
import { uploadStatusDismissed } from "../src/features/capture/uploadsSlice";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";

jest.mock("expo-file-system", () => jest.requireActual("@platform/mobile/test-support/fakeFileSystem"));
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn() }));
jest.mock("../src/features/aiPermission/aiPermission", () => ({
  ...jest.requireActual("../src/features/aiPermission/aiPermission"),
  hasAiPermission: () => true,
}));

const originalAdapter = api.defaults.adapter;
const SOURCE = "doc:/source.jpg";
const DEMO = "This feature is not available for demo accounts";

type Answer = { status: number; data?: unknown } | "offline";

function serverAnswering(answer: Answer): void {
  const adapter: AxiosAdapter = (config) => {
    if (answer === "offline") return Promise.reject(Object.assign(new Error("Network Error"), { config }));
    const response = { data: answer.data ?? {}, status: answer.status, statusText: "", headers: {}, config };
    return Promise.reject(Object.assign(new Error(String(answer.status)), { config, response, isAxiosError: true }));
  };
  api.defaults.adapter = adapter;
}

function queueOne(): void {
  resetFakeFiles([...fakeFiles(), SOURCE]);
  addToQueue("w1", SOURCE, "a.jpg");
}

async function drainAfter(answer: Answer) {
  queueOne();
  serverAnswering(answer);
  await store.dispatch(drainUploadQueue());
  return { phase: store.getState().uploads.phase, kept: pendingUploads("w1").length, uploads: store.getState().uploads };
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
  clearUploadQueue();
});

describe("how a failed upload is told apart", () => {
  it.each([
    ["no answer at all", "offline", "unreachable", 1],
    ["a server error", { status: 500 }, "unreachable", 1],
    ["a request timeout", { status: 408 }, "unreachable", 1],
    ["a 401 after the session was renewed", { status: 401 }, "signedOut", 1],
    ["a view-only person", { status: 403, data: { detail: "Write access required" } }, "blocked", 1],
    ["a demo workspace", { status: 403, data: { detail: DEMO } }, "blocked", 1],
    ["a workspace that's gone", { status: 404 }, "blocked", 1],
    ["a bad request", { status: 400, data: { detail: "Bad file" } }, "idle", 0],
    ["a conflict", { status: 409, data: { detail: "Already added" } }, "idle", 0],
    ["a file too big", { status: 413 }, "idle", 0],
    ["the daily limit", { status: 429 }, "limitReached", 1],
  ] as [string, Answer, string, number][])("%s", async (_name, answer, phase, kept) => {
    const result = await drainAfter(answer);
    expect(result.phase).toBe(phase);
    expect(result.kept).toBe(kept);
  });

  it("gives the view-only reason, not the unreachable one", async () => {
    const { uploads } = await drainAfter({ status: 403, data: { detail: "Write access required" } });
    expect(uploads.blockedReason).toBe("You have view-only access in this workspace, so I can't add documents.");
  });

  it("gives the demo reason for a demo workspace", async () => {
    const { uploads } = await drainAfter({ status: 403, data: { detail: DEMO } });
    expect(uploads.blockedReason).toBe("Demo workspaces can't add documents.");
  });

  it("passes on the server's own reason for a bad request", async () => {
    const { uploads } = await drainAfter({ status: 400, data: { detail: "Bad file" } });
    expect(uploads.rejections).toEqual(["I couldn't send a.jpg. Bad file"]);
  });
});
