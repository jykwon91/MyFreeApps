import "@platform/mobile/test-support/reactNativeFormData";
import type { OrgWithRole } from "@mybookkeeper/api-client/types/organization/OrgWithRole";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { SessionContext } from "@platform/mobile/src/auth/SessionContext";
import { fakeFiles, resetFakeFiles } from "@platform/mobile/test-support/fakeFileSystem";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { File, Paths } from "expo-file-system";
import { AppState, Text } from "react-native";
import { Provider } from "react-redux";
import { MEMBERS_MESSAGES } from "../src/constants/members";
import { SAVED_WORKSPACE_FILE, WORKSPACE_MESSAGES as MESSAGES } from "../src/constants/workspace";
import CaptureScreen from "../src/features/capture/CaptureScreen";
import { pendingUploads } from "../src/features/capture/uploadQueueFiles";
import { uploadStatusDismissed } from "../src/features/capture/uploadsSlice";
import { useResumeUploads } from "../src/features/capture/useResumeUploads";
import { saveWorkspace } from "../src/features/workspace/savedWorkspace";
import { useCanWrite } from "../src/features/workspace/useCanWrite";
import { useIsAdmin } from "../src/features/workspace/useIsAdmin";
import WorkspaceGate from "../src/features/workspace/WorkspaceGate";
import WorkspaceLostToast from "../src/features/workspace/WorkspaceLostToast";
import WorkspaceOfflineNotice from "../src/features/workspace/WorkspaceOfflineNotice";
import WorkspaceSection from "../src/features/workspace/WorkspaceSection";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";

const mockTakePicture = jest.fn();

jest.mock("expo-file-system", () => jest.requireActual("@platform/mobile/test-support/fakeFileSystem"));
jest.mock("expo-router", () => ({ router: { dismissTo: jest.fn(), navigate: jest.fn(), push: jest.fn() } }));
jest.mock("../src/features/aiPermission/aiPermission", () => ({
  ...jest.requireActual("../src/features/aiPermission/aiPermission"),
  hasAiPermission: () => true,
}));
jest.mock("expo-camera", () => {
  const { forwardRef, useImperativeHandle } = jest.requireActual("react");
  const { View } = jest.requireActual("react-native");
  return {
    CameraView: forwardRef(function CameraView(props: object, ref: unknown) {
      useImperativeHandle(ref, () => ({ takePictureAsync: mockTakePicture }));
      return <View {...props} />;
    }),
    useCameraPermissions: () => [{ granted: true, canAskAgain: true }, jest.fn()],
  };
});
jest.mock("expo-image-manipulator", () => ({
  SaveFormat: { JPEG: "jpeg" },
  ImageManipulator: {
    manipulate: () => ({
      release: jest.fn(),
      renderAsync: async () => ({ saveAsync: async () => ({ uri: "doc:/prepared.jpg" }), release: jest.fn() }),
    }),
  },
}));

const EMAIL = "me@example.com";
const MINE: OrgWithRole = { id: "w1", name: "Lake House", org_role: "user", is_demo: false, created_at: "2024-01-01T00:00:00Z" };
const OTHER: OrgWithRole = { id: "w2", name: "Beach Condo", org_role: "owner", is_demo: false, created_at: "2024-02-01T00:00:00Z" };
const originalAdapter = api.defaults.adapter;

type Answer = number | "offline";

interface FakeServer {
  organizations: Answer;
  workspaces: unknown[];
  uploadsOnline: boolean;
  uploadedFor: unknown[];
}

let server: FakeServer;

function reply(config: InternalAxiosRequestConfig, answer: Answer, data: unknown) {
  if (answer === "offline") return Promise.reject(Object.assign(new Error("Network Error"), { config }));
  const response = { data, status: answer, statusText: "", headers: {}, config };
  if (answer < 400) return Promise.resolve(response);
  return Promise.reject(Object.assign(new Error(String(answer)), { config, response, isAxiosError: true }));
}

const adapter: AxiosAdapter = (config) => {
  if (config.url === "/organizations") return reply(config, server.organizations, server.workspaces);
  if (config.url?.startsWith("/documents/upload")) {
    if (!server.uploadsOnline) return reply(config, "offline", null);
    server.uploadedFor.push(config.headers["X-Organization-Id"]);
    return reply(config, 202, { document_id: "d", batch_id: null, batch_total: 1 });
  }
  return reply(config, server.organizations === "offline" ? "offline" : 200, []);
};

function Access() {
  return (
    <Text>
      {useCanWrite() ? "can write" : "can't write"}, {useIsAdmin() ? "admin" : "not admin"}
    </Text>
  );
}

function ResumeUploads() {
  useResumeUploads();
  return null;
}

async function launch(inside: React.ReactNode = <Text>Inside</Text>): Promise<void> {
  await render(
    <Provider store={store}>
      <SessionContext.Provider value={session}>
        <ToastProvider bottomOffset={0}>
          <ResumeUploads />
          <WorkspaceGate>
            <WorkspaceLostToast />
            <WorkspaceOfflineNotice />
            <Access />
            {inside}
          </WorkspaceGate>
        </ToastProvider>
      </SessionContext.Provider>
    </Provider>,
  );
}

/** Coming back to the app asks for the list again, as being back online would. */
async function returnToApp(addListener: jest.SpyInstance): Promise<void> {
  for (const [, listener] of addListener.mock.calls) await act(async () => listener("active"));
}

function goOnline(): void {
  server.organizations = 200;
  server.uploadsOnline = true;
}

beforeEach(() => {
  jest.clearAllMocks();
  resetFakeFiles(["doc:/taken.jpg", "doc:/prepared.jpg"]);
  jest.spyOn(session, "getState").mockReturnValue({ status: "signedIn", email: EMAIL } as never);
  session.tokenStore.set("token");
  store.dispatch(baseApi.util.resetApiState());
  store.dispatch(workspaceChosen(null));
  store.dispatch(uploadStatusDismissed());
  server = { organizations: "offline", workspaces: [MINE, OTHER], uploadsOnline: false, uploadedFor: [] };
  api.defaults.adapter = adapter;
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  jest.restoreAllMocks();
  store.dispatch(baseApi.util.resetApiState());
  store.dispatch(workspaceChosen(null));
});

describe("opening the app offline with a workspace saved on this phone", () => {
  it("opens the app in that workspace, says it's offline, and keeps the saved role", async () => {
    saveWorkspace(MINE);
    await launch();

    expect(await screen.findByText("Inside")).toBeTruthy();
    expect(screen.getByText(MESSAGES.offlineCanCapture("Lake House"))).toBeTruthy();
    expect(screen.queryByRole("header", { name: "You're offline" })).toBeNull();
    expect(store.getState().workspace.activeId).toBe("w1");
    // A user may add things; nothing only an owner or admin may do is offered from a saved role.
    expect(screen.getByText("can write, not admin")).toBeTruthy();
  });

  it("queues a photo under the saved workspace, and sends it when the connection is back", async () => {
    const addListener = jest.spyOn(AppState, "addEventListener");
    saveWorkspace(MINE);
    mockTakePicture.mockResolvedValue({ uri: "doc:/taken.jpg" });
    await launch(<CaptureScreen />);

    await fireEvent.press(await screen.findByRole("button", { name: "Take photo" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Use photo" }));
    await waitFor(() => expect(pendingUploads("w1")).toHaveLength(1));
    expect(fakeFiles().some((uri) => uri.includes(`${encodeURIComponent(EMAIL)}~w1/`))).toBe(true);
    expect(server.uploadedFor).toEqual([]);

    goOnline();
    await returnToApp(addListener);
    await waitFor(() => expect(server.uploadedFor).toEqual(["w1"]));
    await waitFor(() => expect(pendingUploads("w1")).toHaveLength(0));
  });

  it("switches to normal once the list loads: the notice goes and the loaded role takes over", async () => {
    const addListener = jest.spyOn(AppState, "addEventListener");
    saveWorkspace({ ...MINE, org_role: "viewer" });
    await launch(<WorkspaceSection />);
    expect(await screen.findByText(MESSAGES.offlineReadOnly("Lake House"))).toBeTruthy();
    expect(screen.getByText(MESSAGES.currentOffline("Lake House"))).toBeTruthy();
    expect(screen.getByText("can't write, not admin")).toBeTruthy();

    server.organizations = 200;
    await returnToApp(addListener);

    await waitFor(() => expect(screen.queryByText(MESSAGES.offlineReadOnly("Lake House"))).toBeNull());
    expect(store.getState().workspace).toMatchObject({ activeId: "w1", remembered: null });
    expect(screen.getByRole("button", { name: "Switch workspace, Lake House, User" })).toBeTruthy();
    expect(screen.getByText("can write, not admin")).toBeTruthy();
  });

  it("keeps asking for the list in the background while offline", async () => {
    jest.useFakeTimers();
    try {
      saveWorkspace(MINE);
      await launch();
      expect(await screen.findByText(MESSAGES.offlineCanCapture("Lake House"))).toBeTruthy();

      server.organizations = 200;
      await act(async () => jest.advanceTimersByTime(15_000));
      await waitFor(() => expect(screen.queryByText(MESSAGES.offlineCanCapture("Lake House"))).toBeNull());
      expect(screen.getByText("Inside")).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  it("allows nothing role-gated when the saved workspace has no role with it", async () => {
    // As saved by a version of the app from before roles were saved.
    new File(Paths.document, SAVED_WORKSPACE_FILE).write(JSON.stringify({ owner: EMAIL, workspaceId: "w1", workspaceName: "Lake House" }));
    await launch();
    expect(await screen.findByText("Inside")).toBeTruthy();
    expect(screen.getByText("can't write, not admin")).toBeTruthy();
    expect(screen.getByText(MESSAGES.offlineReadOnly("Lake House"))).toBeTruthy();
  });

  it("falls back to the first workspace, and says so, when the loaded list no longer has the saved one", async () => {
    const addListener = jest.spyOn(AppState, "addEventListener");
    saveWorkspace({ id: "gone", name: "Old Place", org_role: "owner" });
    await launch();
    expect(await screen.findByText(MESSAGES.offlineCanCapture("Old Place"))).toBeTruthy();

    server.organizations = 200;
    await returnToApp(addListener);

    await waitFor(() => expect(store.getState().workspace.activeId).toBe("w1"));
    expect(await screen.findByText(MEMBERS_MESSAGES.workspaceLost("Old Place", "Lake House"))).toBeTruthy();
    expect(store.getState().workspace.remembered).toBeNull();
    expect(screen.queryByText(MESSAGES.offlineCanCapture("Old Place"))).toBeNull();
    await waitFor(() => expect(screen.getByText("Inside")).toBeTruthy());
  });

  it("shows the empty state when the loaded list has no workspace at all", async () => {
    const addListener = jest.spyOn(AppState, "addEventListener");
    saveWorkspace(MINE);
    await launch();
    expect(await screen.findByText("Inside")).toBeTruthy();

    server.workspaces = [];
    server.organizations = 200;
    await returnToApp(addListener);

    expect(await screen.findByRole("header", { name: "No workspace yet" })).toBeTruthy();
    expect(screen.queryByText("Inside")).toBeNull();
  });
});

describe("when the saved workspace can't be used", () => {
  it("shows the offline screen as before when nothing is saved", async () => {
    await launch();
    expect(await screen.findByRole("header", { name: "You're offline" })).toBeTruthy();
    expect(screen.queryByText("Inside")).toBeNull();
    expect(store.getState().workspace.remembered).toBeNull();
  });

  it("ignores a workspace someone else saved on this phone", async () => {
    jest.mocked(session.getState).mockReturnValue({ status: "signedIn", email: "someone@example.com" } as never);
    saveWorkspace(MINE);
    jest.mocked(session.getState).mockReturnValue({ status: "signedIn", email: EMAIL } as never);
    await launch();
    expect(await screen.findByRole("header", { name: "You're offline" })).toBeTruthy();
    expect(screen.queryByText("Inside")).toBeNull();
  });

  it.each([401, 403, 500, 503])("shows the error screen, not the saved workspace, when the server answers %i", async (status) => {
    saveWorkspace(MINE);
    server.organizations = status;
    await launch();
    expect(await screen.findByRole("header", { name: "Couldn't load your workspaces" })).toBeTruthy();
    expect(screen.queryByText("Inside")).toBeNull();
    expect(store.getState().workspace.remembered).toBeNull();
  });

  it("shows the error screen when the server answers with an error after opening offline", async () => {
    const addListener = jest.spyOn(AppState, "addEventListener");
    saveWorkspace(MINE);
    await launch();
    expect(await screen.findByText("Inside")).toBeTruthy();

    server.organizations = 500;
    await returnToApp(addListener);
    expect(await screen.findByRole("header", { name: "Couldn't load your workspaces" })).toBeTruthy();
    expect(screen.queryByText("Inside")).toBeNull();
  });
});
