import "../test-support/reactNativeFormData";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { waitFor } from "@testing-library/react-native";
import type { AxiosAdapter } from "axios";
import { UPLOAD_TIMEOUT_MS } from "../src/constants/capture";
import { drainUploadQueue } from "../src/features/capture/drainUploadQueue";
import { addToQueue, clearUploadQueue, pendingUploads } from "../src/features/capture/uploadQueueFiles";
import { uploadForm } from "../src/features/capture/uploadForm";
import { uploadStatusDismissed } from "../src/features/capture/uploadsSlice";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { Directory, fakeFiles, File, resetFakeFiles } from "../test-support/fakeFileSystem";

jest.mock("expo-file-system", () => jest.requireActual("../test-support/fakeFileSystem"));
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn() }));

const originalAdapter = api.defaults.adapter;
const SOURCE = "doc:/source.jpg";

function addFile(workspaceId: string, name: string): void {
  resetSource();
  addToQueue(workspaceId, SOURCE, name);
}

function resetSource(): void {
  resetFakeFiles([...fakeFiles(), SOURCE]);
}
type Answer = number | "offline";

/** Answers each upload in turn, then 202 for the rest, and records what was sent. */
function serverAnswering(...answers: Answer[]): { sent: FormData[] } {
  const record = { sent: [] as FormData[] };
  const adapter: AxiosAdapter = (config) => {
    record.sent.push(config.data as FormData);
    const answer = answers.shift() ?? 202;
    if (answer === "offline") return Promise.reject(Object.assign(new Error("Network Error"), { config }));
    const response = { data: { detail: "Unsupported file type", document_id: "d", batch_id: null, batch_total: 1 }, status: answer, statusText: "", headers: {}, config };
    if (answer < 400) return Promise.resolve(response);
    return Promise.reject(Object.assign(new Error(String(answer)), { config, response, isAxiosError: true }));
  };
  api.defaults.adapter = adapter;
  return record;
}

const drain = () => store.dispatch(drainUploadQueue());
const waiting = () => pendingUploads("w1").map((upload) => upload.name);
const uploads = () => store.getState().uploads;

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

describe("upload queue", () => {
  it("sends everything, oldest first, and removes each file once the server has it", async () => {
    const now = jest.spyOn(Date, "now");
    now.mockReturnValueOnce(9).mockReturnValueOnce(10);
    addFile("w1", "first.jpg");
    addFile("w1", "second.jpg");
    now.mockRestore();
    expect(waiting()).toEqual(["first.jpg", "second.jpg"]);

    const server = serverAnswering();
    await drain();

    expect(server.sent).toHaveLength(2);
    expect(waiting()).toEqual([]);
    expect(uploads().phase).toBe("sent");
  });

  it("keeps the file when the server can't be reached", async () => {
    addFile("w1", "a.jpg");
    serverAnswering("offline");
    await drain();
    expect(waiting()).toEqual(["a.jpg"]);
    expect(uploads().phase).toBe("unreachable");
  });

  it("keeps the file on a server error, and sends it on the next try", async () => {
    addFile("w1", "a.jpg");
    serverAnswering(500);
    await drain();
    expect(waiting()).toEqual(["a.jpg"]);
    await drain();
    expect(waiting()).toEqual([]);
    expect(uploads().phase).toBe("sent");
  });

  it("stops and keeps everything at the daily limit", async () => {
    addFile("w1", "a.jpg");
    addFile("w1", "b.jpg");
    const server = serverAnswering(429);
    await drain();
    expect(server.sent).toHaveLength(1);
    expect(waiting()).toHaveLength(2);
    expect(uploads().phase).toBe("limitReached");
  });

  it("drops a file the server refuses, says why, and carries on", async () => {
    addFile("w1", "a.jpg");
    addFile("w1", "b.jpg");
    serverAnswering(415);
    await drain();
    expect(waiting()).toEqual([]);
    expect(uploads().rejections[0]).toContain("Unsupported file type");
    expect(uploads().phase).toBe("sent");
  });

  it("doesn't say it's reading anything when every file was refused", async () => {
    addFile("w1", "a.jpg");
    serverAnswering(415);
    await drain();
    expect(uploads().phase).toBe("idle");
  });

  it("keeps every file when the server says this person may not upload", async () => {
    addFile("w1", "a.jpg");
    addFile("w1", "b.jpg");
    const server = serverAnswering(403);
    await drain();
    expect(server.sent).toHaveLength(1);
    expect(waiting()).toHaveLength(2);
    expect(uploads().phase).toBe("unreachable");
  });

  it("doesn't let one file the server fails on hold up the rest", async () => {
    const now = jest.spyOn(Date, "now");
    now.mockReturnValueOnce(9).mockReturnValueOnce(10);
    addFile("w1", "bad.jpg");
    addFile("w1", "good.jpg");
    now.mockRestore();
    const server = serverAnswering(500);
    await drain();
    expect(server.sent).toHaveLength(2);
    expect(waiting()).toEqual(["bad.jpg"]);
    expect(uploads().phase).toBe("unreachable");
  });

  it("can send again after something unexpected goes wrong", async () => {
    addFile("w1", "a.jpg");
    const uri = pendingUploads("w1")[0].uri;
    const server = serverAnswering();
    const list = jest.spyOn(Directory.prototype, "list");
    list.mockImplementationOnce(() => [new File(uri)]);
    list.mockImplementationOnce(() => {
      throw new Error("disk trouble");
    });
    await drain();
    expect(uploads().phase).toBe("unreachable");
    list.mockRestore();
    await drain();
    expect(server.sent).toHaveLength(1);
    expect(uploads().phase).toBe("sent");
  });

  it("stops sending one workspace's files once another is chosen, then sends the new one's", async () => {
    const now = jest.spyOn(Date, "now");
    now.mockReturnValueOnce(9).mockReturnValueOnce(10);
    addFile("w1", "a.jpg");
    addFile("w1", "b.jpg");
    now.mockRestore();
    addFile("w2", "c.jpg");
    const sentTo: unknown[] = [];
    const adapter: AxiosAdapter = (config) => {
      sentTo.push(config.headers["X-Organization-Id"]);
      store.dispatch(workspaceChosen("w2"));
      return Promise.resolve({ data: { document_id: "d" }, status: 202, statusText: "", headers: {}, config });
    };
    api.defaults.adapter = adapter;
    await drain();
    await waitFor(() => expect(pendingUploads("w2")).toEqual([]));
    expect(sentTo).toEqual(["w1", "w2"]);
    expect(pendingUploads("w1").map((upload) => upload.name)).toEqual(["b.jpg"]);
  });

  it("keeps sending after someone dismisses a message mid-send", async () => {
    addFile("w1", "a.jpg");
    addFile("w1", "b.jpg");
    const seen: string[] = [];
    const adapter: AxiosAdapter = (config) => {
      store.dispatch(uploadStatusDismissed());
      seen.push(store.getState().uploads.phase);
      return Promise.resolve({ data: { document_id: "d" }, status: 202, statusText: "", headers: {}, config });
    };
    api.defaults.adapter = adapter;
    await Promise.all([drain(), drain()]);
    expect(seen).toEqual(["sending", "sending"]);
    expect(waiting()).toEqual([]);
  });

  it("gives up on a connection that never answers", async () => {
    jest.useFakeTimers();
    addFile("w1", "a.jpg");
    const adapter: AxiosAdapter = () => new Promise(() => {});
    api.defaults.adapter = adapter;
    const draining = drain();
    await jest.advanceTimersByTimeAsync(UPLOAD_TIMEOUT_MS);
    await draining;
    jest.useRealTimers();
    expect(waiting()).toEqual(["a.jpg"]);
    expect(uploads().phase).toBe("unreachable");
  });

  it("doesn't throw away a file when the session has ended", async () => {
    addFile("w1", "a.jpg");
    serverAnswering(401);
    await drain();
    expect(waiting()).toEqual(["a.jpg"]);
  });

  it("only runs one send at a time", async () => {
    addFile("w1", "a.jpg");
    const server = serverAnswering();
    await Promise.all([drain(), drain()]);
    expect(server.sent).toHaveLength(1);
  });

  it("sends only the current workspace's files", async () => {
    addFile("other", "theirs.jpg");
    const server = serverAnswering();
    await drain();
    expect(server.sent).toHaveLength(0);
    expect(pendingUploads("other")).toHaveLength(1);
  });

  it("leaves one person's waiting photos alone when someone else in the workspace signs in", async () => {
    const getState = jest.spyOn(session, "getState");
    getState.mockReturnValue({ status: "signedIn", email: "first@example.com" } as never);
    addFile("w1", "theirs.jpg");
    getState.mockReturnValue({ status: "signedIn", email: "second@example.com" } as never);
    const server = serverAnswering();
    await drain();
    expect(server.sent).toHaveLength(0);
    getState.mockReturnValue({ status: "signedIn", email: "first@example.com" } as never);
    expect(waiting()).toEqual(["theirs.jpg"]);
    getState.mockRestore();
  });

  it("makes a file name safe but keeps it readable", () => {
    addFile("w1", "../../etc/pass~wd é.pdf");
    const [upload] = pendingUploads("w1");
    expect(upload.name).toBe(".._.._etc_pass_wd _.pdf");
    expect(upload.mimeType).toBe("application/pdf");
  });

  it("describes the file the way React Native's FormData reads it", () => {
    addFile("w1", "a.jpg");
    const [upload] = pendingUploads("w1");
    const parts = (uploadForm(upload) as unknown as { getParts: () => { fieldName: string; name: string; type: string; uri: string }[] }).getParts();
    expect(parts[0]).toMatchObject({ fieldName: "file", name: "a.jpg", type: "image/jpeg", uri: upload.uri });
  });

  it("clears everything", () => {
    addFile("w1", "a.jpg");
    clearUploadQueue();
    expect(fakeFiles()).toEqual([]);
  });
});
