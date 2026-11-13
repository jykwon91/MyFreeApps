import "@platform/mobile/test-support/reactNativeFormData";
import { ORGANIZATION_HEADER } from "@platform/core/constants/organizationHeader";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { waitFor } from "@testing-library/react-native";
import type { AxiosAdapter, AxiosProgressEvent } from "axios";
import { UPLOAD_TIMEOUT_MS } from "../src/constants/capture";
import { drainUploadQueue } from "../src/features/capture/drainUploadQueue";
import { addToQueue, clearUploadQueue, pendingUploads } from "../src/features/capture/uploadQueueFiles";
import { uploadForm } from "../src/features/capture/uploadForm";
import { uploadSentSettled, uploadStatusDismissed } from "../src/features/capture/uploadsSlice";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { Directory, fakeFiles, File, resetFakeFiles } from "@platform/mobile/test-support/fakeFileSystem";

jest.mock("expo-file-system", () => jest.requireActual("@platform/mobile/test-support/fakeFileSystem"));
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn() }));
jest.mock("../src/features/aiPermission/aiPermission", () => ({
  ...jest.requireActual("../src/features/aiPermission/aiPermission"),
  hasAiPermission: () => true,
}));

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

type Part = { fieldName: string; name: string; type: string; uri: string };

function partsOf(form: FormData): Part[] {
  return (form as unknown as { getParts: () => Part[] }).getParts();
}

function progressEvent(loaded: number, total: number): AxiosProgressEvent {
  return { loaded, total, bytes: loaded, lengthComputable: true };
}

const drain = () => store.dispatch(drainUploadQueue());
const rows = () => store.getState().uploads.files.map(({ name, status, percent }) => ({ name, status, percent }));
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

  it("names the size limit when the proxy refuses a file as too big, since its 413 says nothing", async () => {
    addFile("w1", "scans.zip");
    serverAnswering(413);
    await drain();
    expect(waiting()).toEqual([]);
    expect(uploads().rejections).toEqual(["scans.zip is over 29 MB, which is more than I can take. Try a smaller file, or split it up."]);
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

  it("files a photo in its own workspace when the send is retried after a switch", async () => {
    addFile("w1", "a.jpg");
    const sentTo: unknown[] = [];
    const adapter: AxiosAdapter = (config) => {
      sentTo.push(config.headers[ORGANIZATION_HEADER]);
      if (sentTo.length > 1) return Promise.resolve({ data: { document_id: "d" }, status: 202, statusText: "", headers: {}, config });
      // The session renews and the user switches before the retry goes out.
      session.tokenStore.set("renewed");
      store.dispatch(workspaceChosen("w2"));
      const response = { data: {}, status: 401, statusText: "", headers: {}, config };
      return Promise.reject(Object.assign(new Error("401"), { config, response, isAxiosError: true }));
    };
    api.defaults.adapter = adapter;
    await drain();
    expect(sentTo).toEqual(["w1", "w1"]);
    expect(pendingUploads("w1")).toEqual([]);
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

  it.each([
    ["lease.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    ["ledger.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    ["bank.csv", "text/csv"],
    ["receipts.zip", "application/zip"],
    ["old.doc", "application/msword"],
    ["old.xls", "application/vnd.ms-excel"],
  ])("sends %s with its own name and type", async (name, type) => {
    addFile("w1", name);
    const server = serverAnswering();
    await drain();
    expect(partsOf(server.sent[0])[0]).toMatchObject({ fieldName: "file", name, type });
    expect(waiting()).toEqual([]);
  });

  it("shows each file waiting, then sending with how far it's got, then sent", async () => {
    const now = jest.spyOn(Date, "now");
    now.mockReturnValueOnce(9).mockReturnValueOnce(10);
    addFile("w1", "lease.docx");
    addFile("w1", "bank.csv");
    now.mockRestore();
    const seen: ReturnType<typeof rows>[] = [];
    const adapter: AxiosAdapter = (config) => {
      seen.push(rows());
      config.onUploadProgress?.(progressEvent(40, 100));
      seen.push(rows());
      return Promise.resolve({ data: { document_id: "d" }, status: 202, statusText: "", headers: {}, config });
    };
    api.defaults.adapter = adapter;

    await drain();

    expect(seen[0]).toEqual([
      { name: "lease.docx", status: "uploading", percent: null },
      { name: "bank.csv", status: "queued", percent: null },
    ]);
    expect(seen[1][0]).toEqual({ name: "lease.docx", status: "uploading", percent: 40 });
    expect(seen[3]).toEqual([
      { name: "lease.docx", status: "done", percent: null },
      { name: "bank.csv", status: "uploading", percent: 40 },
    ]);
    expect(rows()).toEqual([
      { name: "lease.docx", status: "done", percent: null },
      { name: "bank.csv", status: "done", percent: null },
    ]);
    expect(uploads().phase).toBe("sent");
  });

  it("says nothing about progress when the size isn't known", async () => {
    addFile("w1", "receipts.zip");
    const percents: (number | null)[] = [];
    const adapter: AxiosAdapter = (config) => {
      config.onUploadProgress?.({ loaded: 10, bytes: 10, lengthComputable: false });
      percents.push(store.getState().uploads.files[0].percent);
      return Promise.resolve({ data: { document_id: "d" }, status: 202, statusText: "", headers: {}, config });
    };
    api.defaults.adapter = adapter;
    await drain();
    expect(percents).toEqual([null]);
  });

  it("clears the sent files once the message has been up long enough", async () => {
    addFile("w1", "ledger.xlsx");
    serverAnswering();
    await drain();
    store.dispatch(uploadSentSettled());
    expect(rows()).toEqual([]);
    expect(uploads().phase).toBe("idle");
  });

  it("marks a refused file as failed and keeps saying so until it's dismissed", async () => {
    addFile("w1", "receipts.zip");
    serverAnswering(415);
    await drain();
    expect(rows()).toEqual([{ name: "receipts.zip", status: "failed", percent: null }]);
    store.dispatch(uploadStatusDismissed());
    expect(rows()).toEqual([]);
  });

  it("marks a file the server failed on, then sends it again on the next try", async () => {
    addFile("w1", "lease.docx");
    serverAnswering(500);
    await drain();
    expect(rows()).toEqual([{ name: "lease.docx", status: "failed", percent: null }]);
    await drain();
    expect(rows()).toEqual([{ name: "lease.docx", status: "done", percent: null }]);
  });

  it("marks the file being sent as failed when the connection drops", async () => {
    addFile("w1", "bank.csv");
    serverAnswering("offline");
    await drain();
    expect(rows()).toEqual([{ name: "bank.csv", status: "failed", percent: null }]);
    expect(waiting()).toEqual(["bank.csv"]);
  });

  it("lists nothing as on its way at the daily limit: the files wait for tomorrow", async () => {
    addFile("w1", "a.docx");
    addFile("w1", "b.docx");
    serverAnswering(429);
    await drain();
    expect(rows()).toEqual([]);
    expect(waiting()).toHaveLength(2);
  });

  it("shows only the chosen workspace's files once another is chosen mid-send", async () => {
    addFile("w1", "theirs.xlsx");
    addFile("w2", "mine.csv");
    const adapter: AxiosAdapter = (config) => {
      store.dispatch(workspaceChosen("w2"));
      return Promise.resolve({ data: { document_id: "d" }, status: 202, statusText: "", headers: {}, config });
    };
    api.defaults.adapter = adapter;
    await drain();
    await waitFor(() => expect(pendingUploads("w2")).toEqual([]));
    await waitFor(() => expect(rows()).toEqual([{ name: "mine.csv", status: "done", percent: null }]));
  });
});
