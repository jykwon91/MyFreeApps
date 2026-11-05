import "../test-support/reactNativeFormData";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { onAccountLeft, ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter } from "axios";
import { Linking } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Provider } from "react-redux";
import CameraRoute from "../app/(app)/camera";
import { AI_PERMISSION_FILE, AI_PERMISSION_VERSION } from "../src/constants/aiPermission";
import { allowAi, hasAiPermission, stopAi } from "../src/features/aiPermission/aiPermission";
import AiPermissionPanel from "../src/features/aiPermission/AiPermissionPanel";
import { drainUploadQueue } from "../src/features/capture/drainUploadQueue";
import { addToQueue, pendingUploads } from "../src/features/capture/uploadQueueFiles";
import { uploadStatusDismissed } from "../src/features/capture/uploadsSlice";
import UploadStatus from "../src/features/capture/UploadStatus";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { Directory, fakeFiles, File, resetFakeFiles } from "../test-support/fakeFileSystem";

jest.mock("@platform/mobile", () => ({
  ...jest.requireActual("@platform/mobile"),
  onAccountLeft: jest.fn(),
}));
const mockDismissTo = jest.fn();
const mockPush = jest.fn();
jest.mock("expo-file-system", () => jest.requireActual("../test-support/fakeFileSystem"));
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn() }));
jest.mock("expo-router", () => ({
  Redirect: () => null,
  router: { dismissTo: (path: string) => mockDismissTo(path), push: (path: string) => mockPush(path) },
}));
jest.mock("expo-camera", () => ({
  CameraView: () => null,
  useCameraPermissions: () => [{ granted: true, canAskAgain: true }, jest.fn()],
}));
jest.mock("../src/features/workspace/useCanWrite", () => ({ useCanWrite: () => true }));

const accountLeft = jest.mocked(onAccountLeft).mock.calls[0]![1];
const originalAdapter = api.defaults.adapter;
const SOURCE = "doc:/source.jpg";
const SIGNED_IN = { status: "signedIn", email: "me@example.com" };

function signedInAs(state: { status: string; email?: string }): void {
  jest.spyOn(session, "getState").mockReturnValue(state as never);
}

function addFile(name: string): void {
  resetFakeFiles([...fakeFiles(), SOURCE]);
  addToQueue("w1", SOURCE, name);
}

function serverCounting(): { count: number } {
  const record = { count: 0 };
  const adapter: AxiosAdapter = (config) => {
    record.count += 1;
    if (record.count === 1) stopIfAsked();
    return Promise.resolve({ data: { document_id: "d" }, status: 202, statusText: "", headers: {}, config });
  };
  api.defaults.adapter = adapter;
  return record;
}

let stopIfAsked: () => void = () => {};

function wrapped(ui: React.ReactNode) {
  return (
    <Provider store={store}>
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <ToastProvider bottomOffset={0}>{ui}</ToastProvider>
      </SafeAreaProvider>
    </Provider>
  );
}

const drain = () => store.dispatch(drainUploadQueue());

beforeEach(() => {
  resetFakeFiles();
  stopIfAsked = () => {};
  mockDismissTo.mockClear();
  mockPush.mockClear();
  signedInAs(SIGNED_IN);
  session.tokenStore.set("token");
  store.dispatch(baseApi.util.resetApiState());
  store.dispatch(workspaceChosen("w1"));
  store.dispatch(uploadStatusDismissed());
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  jest.restoreAllMocks();
});

describe("what counts as permission", () => {
  it("is off until someone says yes, and off again when they stop", () => {
    expect(hasAiPermission()).toBe(false);
    allowAi();
    expect(hasAiPermission()).toBe(true);
    stopAi();
    expect(hasAiPermission()).toBe(false);
  });

  it("doesn't carry over to another person on the same phone", () => {
    allowAi();
    signedInAs({ status: "signedIn", email: "other@example.com" });
    expect(hasAiPermission()).toBe(false);
  });

  it("doesn't count when nobody is signed in", () => {
    allowAi();
    signedInAs({ status: "signedOut" });
    expect(hasAiPermission()).toBe(false);
    expect(() => allowAi()).toThrow();
  });

  it("asks again when what's sent has changed", () => {
    new File("doc:", AI_PERMISSION_FILE).create();
    new File("doc:", AI_PERMISSION_FILE).write(
      JSON.stringify({ owner: SIGNED_IN.email, version: AI_PERMISSION_VERSION - 1 }),
    );
    expect(hasAiPermission()).toBe(false);
  });

  it("treats an unreadable answer as no", () => {
    new File("doc:", AI_PERMISSION_FILE).create();
    new File("doc:", AI_PERMISSION_FILE).write("not json");
    expect(hasAiPermission()).toBe(false);
  });

  it("is forgotten when the person leaves the account", () => {
    allowAi();
    accountLeft();
    expect(hasAiPermission()).toBe(false);
  });
});

describe("leaving the account", () => {
  it("clears everything else and doesn't throw when one step fails", () => {
    allowAi();
    addFile("a.jpg");
    const logged = jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(Directory.prototype, "delete").mockImplementation(() => {
      throw new Error("locked");
    });
    expect(() => accountLeft()).not.toThrow();
    expect(hasAiPermission()).toBe(false);
    expect(logged).toHaveBeenCalled();
  });
});

describe("sending", () => {
  it("sends nothing without permission, keeps the files and says they're waiting", async () => {
    addFile("a.jpg");
    const server = serverCounting();
    await drain();
    expect(server.count).toBe(0);
    expect(pendingUploads("w1")).toHaveLength(1);
    expect(store.getState().uploads.phase).toBe("waitingForPermission");
  });

  it("sends what was waiting once allowed", async () => {
    addFile("a.jpg");
    const server = serverCounting();
    await drain();
    allowAi();
    await drain();
    expect(server.count).toBe(1);
    expect(pendingUploads("w1")).toHaveLength(0);
  });

  it("stops at the next file when permission is withdrawn mid-queue", async () => {
    const now = jest.spyOn(Date, "now");
    now.mockReturnValueOnce(9).mockReturnValueOnce(10);
    addFile("first.jpg");
    addFile("second.jpg");
    now.mockRestore();
    allowAi();
    stopIfAsked = stopAi;
    const server = serverCounting();
    await drain();
    expect(server.count).toBe(1);
    expect(pendingUploads("w1").map((upload) => upload.name)).toEqual(["second.jpg"]);
    expect(store.getState().uploads.phase).toBe("waitingForPermission");
  });

  it("stops saying files are waiting when there aren't any", async () => {
    addFile("a.jpg");
    await drain();
    store.dispatch(workspaceChosen("w2"));
    await drain();
    expect(store.getState().uploads.phase).toBe("idle");
  });
});

describe("the camera", () => {
  it("asks first, and shows no camera, library or files until allowed", async () => {
    await render(wrapped(<CameraRoute />));
    expect(screen.getByRole("header", { name: "Let Claude read your documents?" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Library" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Files" })).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: "Allow" }));

    expect(await screen.findByRole("button", { name: "Library" })).toBeTruthy();
    expect(hasAiPermission()).toBe(true);
  });

  it("leaves without saving an answer on Not now", async () => {
    await render(wrapped(<CameraRoute />));
    await fireEvent.press(screen.getByRole("button", { name: "Not now" }));
    expect(mockDismissTo).toHaveBeenCalledWith("/money");
    expect(hasAiPermission()).toBe(false);
  });

  it("names who gets what, and links the policy", async () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    await render(wrapped(<CameraRoute />));
    expect(screen.getByText(/send it to Claude, an AI made by Anthropic/)).toBeTruthy();
    expect(screen.getByText(/names, addresses and amounts/)).toBeTruthy();
    await fireEvent.press(screen.getByRole("link", { name: "Read the privacy policy" }));
    expect(open.mock.calls[0]?.[0]).toMatch(/\/privacy$/);
  });
});

describe("the panel", () => {
  it("sends waiting files when allowed, then tells the caller", async () => {
    addFile("a.jpg");
    const server = serverCounting();
    const onAllowed = jest.fn();
    await render(wrapped(<AiPermissionPanel onAllowed={onAllowed} onNotNow={jest.fn()} />));
    expect(screen.getByText("1 file is saved on this phone. I'll send it to Claude once you allow it.")).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: "Allow" }));

    await waitFor(() => expect(server.count).toBe(1));
    expect(onAllowed).toHaveBeenCalled();
  });

  it("says so and sends nothing when the answer can't be saved", async () => {
    addFile("a.jpg");
    const server = serverCounting();
    const onAllowed = jest.fn();
    jest.spyOn(File.prototype, "write").mockImplementation(() => {
      throw new Error("disk full");
    });
    await render(wrapped(<AiPermissionPanel onAllowed={onAllowed} onNotNow={jest.fn()} />));

    await fireEvent.press(screen.getByRole("button", { name: "Allow" }));

    expect(await screen.findByText("I couldn't save that, so nothing was sent. Want to try again?")).toBeTruthy();
    expect(server.count).toBe(0);
    expect(onAllowed).not.toHaveBeenCalled();
  });

  it("can be turned off, and says it doesn't take anything back", async () => {
    allowAi();
    await render(wrapped(<AiPermissionPanel onNotNow={jest.fn()} />));
    expect(screen.getByText(/doesn't take back what I've already sent/)).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: "Stop sending" }));

    expect(await screen.findByText("I've stopped sending new files.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Allow" })).toBeTruthy();
    expect(hasAiPermission()).toBe(false);
  });

  it("says it's still on when turning it off fails", async () => {
    allowAi();
    jest.spyOn(File.prototype, "delete").mockImplementation(() => {
      throw new Error("locked");
    });
    await render(wrapped(<AiPermissionPanel onNotNow={jest.fn()} />));

    await fireEvent.press(screen.getByRole("button", { name: "Stop sending" }));

    expect(await screen.findByText("I couldn't change that, so it's still on. Want to try again?")).toBeTruthy();
    expect(hasAiPermission()).toBe(true);
  });

  it("says what Gmail and the inquiry form do, because this choice doesn't cover them", async () => {
    await render(wrapped(<AiPermissionPanel onNotNow={jest.fn()} />));
    expect(screen.getByText(/disconnect Gmail there/)).toBeTruthy();
    expect(screen.getByText(/email addresses and phone numbers removed/)).toBeTruthy();
  });
});

describe("waiting files", () => {
  it("shows outside the camera, with a way to review the choice", async () => {
    addFile("a.jpg");
    addFile("b.jpg");
    await drain();
    await render(wrapped(<UploadStatus />));
    expect(screen.getByText("2 files are saved on this phone. I'll send them to Claude once you allow it.")).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Review" }));
    });
    expect(mockPush).toHaveBeenCalledWith("/ai-permission");
  });
});
