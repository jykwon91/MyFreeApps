import { membersApi } from "@mybookkeeper/api-client/store/membersApi";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { Provider } from "react-redux";
import { WORKSPACE_HOME_ROUTE, WORKSPACE_MESSAGES as MESSAGES } from "../src/constants/workspace";
import { readSavedWorkspaceId } from "../src/features/workspace/savedWorkspace";
import WorkspaceGate from "../src/features/workspace/WorkspaceGate";
import WorkspaceSection from "../src/features/workspace/WorkspaceSection";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { resetFakeFiles } from "@platform/mobile/test-support/fakeFileSystem";

const mockNavigate = jest.fn();
jest.mock("expo-router", () => ({ router: { navigate: (path: string) => mockNavigate(path) } }));
jest.mock("expo-file-system", () => jest.requireActual("@platform/mobile/test-support/fakeFileSystem"));
jest.mock("@platform/mobile", () => ({
  ...jest.requireActual("@platform/mobile"),
  useSession: () => ({ session: { signOut: jest.fn() }, state: { status: "signedIn" } }),
}));

const MINE = { id: "w1", name: "Mine", org_role: "owner", is_demo: false, created_at: "2024-01-01T00:00:00Z" };
const OTHER = { id: "w2", name: "Other", org_role: "user", is_demo: false, created_at: "2024-02-01T00:00:00Z" };
const CREATED = { id: "w3", name: "New Co", org_role: "owner", is_demo: false, created_at: "2026-11-13T00:00:00Z" };
const originalAdapter = api.defaults.adapter;

type Reply = { status: number; data?: unknown } | "offline";

interface FakeServer {
  workspaces: unknown[];
  /** What a create is answered with. The new workspace joins the list when it succeeds and `listsCreated` holds. */
  create: Reply;
  listsCreated: boolean;
  created: unknown[];
  sentFor: Record<string, unknown>;
}

let server: FakeServer;

function reply(config: InternalAxiosRequestConfig, answer: Reply) {
  if (answer === "offline") return Promise.reject(Object.assign(new Error("Network Error"), { config }));
  const response = { data: answer.data ?? null, status: answer.status, statusText: "", headers: {}, config };
  if (answer.status < 400) return Promise.resolve(response);
  return Promise.reject(Object.assign(new Error(String(answer.status)), { config, response, isAxiosError: true }));
}

const adapter: AxiosAdapter = (config) => {
  server.sentFor[config.url ?? ""] = config.headers["X-Organization-Id"];
  if (config.url === "/organizations" && config.method === "post") {
    server.created.push(JSON.parse(config.data as string));
    if (server.create !== "offline" && server.create.status < 400 && server.listsCreated) server.workspaces = [...server.workspaces, CREATED];
    return reply(config, server.create);
  }
  if (config.url === "/organizations") return reply(config, { status: 200, data: server.workspaces });
  return reply(config, { status: 200, data: [] });
};

/** What the cache holds for an endpoint, whatever its argument. */
function cached(endpointName: string): unknown[] {
  return Object.values(store.getState().api.queries)
    .filter((entry) => entry?.endpointName === endpointName && entry.data !== undefined)
    .map((entry) => entry?.data);
}

async function show(): Promise<void> {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <WorkspaceGate>
          <WorkspaceSection />
        </WorkspaceGate>
      </ToastProvider>
    </Provider>,
  );
  await screen.findByTestId("workspace-section");
}

async function openCreate(): Promise<void> {
  await fireEvent.press(screen.getByRole("button", { name: MESSAGES.newWorkspace }));
}

async function createNamed(name: string): Promise<void> {
  await openCreate();
  await fireEvent.changeText(screen.getByLabelText(`${MESSAGES.name}, required`), name);
  await fireEvent.press(screen.getByRole("button", { name: MESSAGES.create }));
}

beforeEach(() => {
  jest.clearAllMocks();
  resetFakeFiles();
  jest.spyOn(session, "getState").mockReturnValue({ status: "signedIn", email: "me@example.com" } as never);
  session.tokenStore.set("token");
  store.dispatch(baseApi.util.resetApiState());
  store.dispatch(workspaceChosen("w1"));
  server = { workspaces: [MINE, OTHER], create: { status: 201, data: { ...CREATED, created_by: "u" } }, listsCreated: true, created: [], sentFor: {} };
  api.defaults.adapter = adapter;
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  jest.restoreAllMocks();
  store.dispatch(baseApi.util.resetApiState());
});

describe("switching workspace", () => {
  it("is hidden with one workspace, which is named instead, and creating stays reachable", async () => {
    server.workspaces = [MINE];
    await show();
    expect(screen.getByText("Mine, Owner")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Switch workspace/ })).toBeNull();
    expect(screen.getByRole("button", { name: MESSAGES.newWorkspace })).toBeTruthy();
  });

  it("opens the chosen one, empties the cache, remembers it and goes Home", async () => {
    await show();
    await store.dispatch(membersApi.endpoints.listMembers.initiate("w1"));
    expect(cached("listMembers")).toEqual([[]]);

    await fireEvent.press(screen.getByRole("button", { name: "Switch workspace, Mine, Owner" }));
    await fireEvent.press(screen.getByRole("radio", { name: "Other, User" }));

    expect(store.getState().workspace.activeId).toBe("w2");
    expect(cached("listMembers")).toEqual([]);
    // The person's own list of workspaces isn't the old workspace's data, so the screens stay up.
    expect(cached("listOrganizations")).toEqual([[MINE, OTHER]]);
    expect(mockNavigate).toHaveBeenCalledWith(WORKSPACE_HOME_ROUTE);
    expect(await screen.findByText(MESSAGES.switched("Other"))).toBeTruthy();
    await waitFor(() => expect(readSavedWorkspaceId()).toBe("w2"));

    await api.get("/transactions");
    expect(server.sentFor["/transactions"]).toBe("w2");
  });

  it("does nothing when the open one is picked again", async () => {
    await show();
    await fireEvent.press(screen.getByRole("button", { name: "Switch workspace, Mine, Owner" }));
    await fireEvent.press(screen.getByRole("radio", { name: "Mine, Owner" }));
    expect(store.getState().workspace.activeId).toBe("w1");
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe("creating a workspace", () => {
  it("asks for a name before sending anything", async () => {
    await show();
    await createNamed("   ");
    expect(screen.getByText("Enter a name.")).toBeTruthy();
    expect(server.created).toEqual([]);
  });

  it("sends the trimmed name, then opens the new workspace", async () => {
    await show();
    await createNamed("  New Co ");

    await waitFor(() => expect(store.getState().workspace.activeId).toBe("w3"));
    expect(server.created).toEqual([{ name: "New Co" }]);
    expect(mockNavigate).toHaveBeenCalledWith(WORKSPACE_HOME_ROUTE);
    expect(await screen.findByText(MESSAGES.created("New Co"))).toBeTruthy();
    expect(screen.queryByRole("button", { name: MESSAGES.create })).toBeNull();
  });

  it.each([
    ["a demo account", { status: 403, data: { detail: "This feature is not available for demo accounts" } }, MESSAGES.demoRefused],
    ["the server failing", { status: 500 }, MESSAGES.couldntCreateServer],
    ["no connection", "offline", MESSAGES.couldntCreate],
  ] as const)("keeps the form open and says why on %s", async (_case, answer, message) => {
    server.create = answer;
    await show();
    await createNamed("New Co");

    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.getByRole("button", { name: MESSAGES.create })).toBeTruthy();
    expect(store.getState().workspace.activeId).toBe("w1");
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("stays where it is, and says so, when the new workspace can't be found yet", async () => {
    server.listsCreated = false;
    await show();
    await createNamed("New Co");

    expect(await screen.findByText(MESSAGES.createdNotOpened("New Co"))).toBeTruthy();
    expect(store.getState().workspace.activeId).toBe("w1");
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
