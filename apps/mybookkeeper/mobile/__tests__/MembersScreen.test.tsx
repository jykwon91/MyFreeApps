import { membersApi } from "@mybookkeeper/api-client/store/membersApi";
import type { OrgInvite } from "@mybookkeeper/api-client/types/organization/OrgInvite";
import type { OrgMember } from "@mybookkeeper/api-client/types/organization/OrgMember";
import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter, AxiosRequestConfig } from "axios";
import { Alert, Text } from "react-native";
import { Provider, useSelector } from "react-redux";
import { ALREADY_MEMBER_DETAIL, MEMBERS_MESSAGES as MESSAGES, NOT_A_MEMBER_DETAIL } from "../src/constants/members";
import { SHOWING_LAST_LOADED_MESSAGE } from "../src/constants/offline";
import { inviteStatusLine, memberFirstName, memberName } from "../src/features/members/membersDisplay";
import MembersScreen from "../src/features/members/MembersScreen";
import WorkspaceGate from "../src/features/workspace/WorkspaceGate";
import { workspaceApi } from "../src/features/workspace/workspaceApi";
import WorkspaceLostToast from "../src/features/workspace/WorkspaceLostToast";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { type RootState, store } from "../src/lib/store";
import { useToday } from "../src/lib/useToday";
import type { Workspace } from "../src/types/Workspace";

jest.mock("expo-router", () => ({ useFocusEffect: () => undefined, router: { push: jest.fn() } }));
jest.mock("../src/lib/useToday", () => ({ useToday: jest.fn() }));
jest.mock("react-native/Libraries/Modal/Modal", () => ({
  __esModule: true,
  default: ({ visible, children }: { visible: boolean; children: unknown }) => (visible ? children : null),
}));
jest.mock("@platform/mobile", () => ({
  ...jest.requireActual("@platform/mobile"),
  useSession: () => ({ session: { getState: () => ({ status: "signedIn", email: "Me@Example.com", sessionId: "s" }) } }),
}));

const NOW = new Date("2026-11-05T12:00:00Z");
const originalAdapter = api.defaults.adapter;
const ORG = "org1";
const ACME: Workspace = { id: ORG, name: "Acme", org_role: "owner", is_demo: false };

function aMember(overrides: Partial<OrgMember> = {}): OrgMember {
  return {
    id: "m2",
    organization_id: ORG,
    user_id: "u2",
    org_role: "user",
    joined_at: "2026-01-01T00:00:00Z",
    user_email: "sam@example.com",
    user_name: "Sam Lee",
    ...overrides,
  };
}

const ME = aMember({ id: "m1", user_id: "u1", org_role: "owner", user_email: "me@example.com", user_name: "Jo Me" });

function anInvite(overrides: Partial<OrgInvite> = {}): OrgInvite {
  return {
    id: "i1",
    organization_id: ORG,
    email: "new@example.com",
    org_role: "viewer",
    status: "pending",
    email_sent: true,
    created_at: "2026-11-01T00:00:00Z",
    expires_at: "2026-11-10T12:00:00Z",
    ...overrides,
  };
}

interface Refusal {
  status?: number;
  detail?: unknown;
  /** The server did the work, then the answer was lost. */
  thenApply?: () => void;
}

interface Server {
  members: OrgMember[];
  invites: OrgInvite[];
  workspaces: Workspace[];
  calls: { method: string; url: string; body: unknown }[];
  refuse: Record<string, Refusal>;
  createAnswer?: Partial<OrgInvite>;
  hanging: string | null;
  release: (() => void) | null;
}

function serve(partial: Partial<Server> = {}): Server {
  const server: Server = { members: [ME, aMember()], invites: [], workspaces: [ACME], calls: [], refuse: {}, hanging: null, release: null, ...partial };
  const adapter: AxiosAdapter = async (config: AxiosRequestConfig & { url?: string }) => {
    const method = (config.method ?? "get").toUpperCase();
    const url = config.url ?? "";
    const body: unknown = config.data ? JSON.parse(config.data as string) : undefined;
    server.calls.push({ method, url, body });
    const answer = (data: unknown, status = 200) => ({ data, status, statusText: "", headers: {}, config }) as never;
    const key = `${method} ${url}`;
    if (server.hanging === key) await new Promise<void>((resolve) => { server.release = resolve; });
    const refusal = server.refuse[key];
    if (refusal) {
      delete server.refuse[key];
      refusal.thenApply?.();
      if (refusal.status === undefined) throw Object.assign(new Error("Network Error"), { isAxiosError: true, config });
      throw Object.assign(new Error("refused"), { isAxiosError: true, config, response: answer({ detail: refusal.detail }, refusal.status) });
    }
    if (url === "/organizations") return answer(server.workspaces);
    if (url === `/organizations/${ORG}/members`) return answer(server.members);
    if (url === `/organizations/${ORG}/invites` && method === "GET") return answer(server.invites);
    if (url === `/organizations/${ORG}/invites` && method === "POST") {
      const sent = body as { email: string; org_role: OrgInvite["org_role"] };
      const invite = anInvite({ id: "new", email: sent.email, org_role: sent.org_role, ...server.createAnswer });
      server.invites = [...server.invites.filter((row) => row.email !== sent.email), invite];
      return answer(invite, 201);
    }
    const roleMatch = /members\/(\w+)\/role$/.exec(url);
    if (roleMatch) {
      const role = (body as { org_role: OrgMember["org_role"] }).org_role;
      server.members = server.members.map((row) => (row.user_id === roleMatch[1] ? { ...row, org_role: role } : row));
      return answer({ id: "m", organization_id: ORG, user_id: roleMatch[1], org_role: role, joined_at: "x" });
    }
    const memberMatch = /members\/(\w+)$/.exec(url);
    if (memberMatch) {
      server.members = server.members.filter((row) => row.user_id !== memberMatch[1]);
      return answer(undefined, 204);
    }
    const inviteMatch = /invites\/(\w+)$/.exec(url);
    if (inviteMatch) {
      server.invites = server.invites.filter((row) => row.id !== inviteMatch[1]);
      return answer(undefined, 204);
    }
    throw new Error(`Unexpected ${key}`);
  };
  api.defaults.adapter = adapter;
  return server;
}

async function show(workspace: Workspace = ACME): Promise<void> {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <MembersScreen workspace={workspace} />
      </ToastProvider>
    </Provider>,
  );
}

async function press(text: string): Promise<void> {
  await fireEvent.press(await screen.findByText(text));
}

async function pressAlertButton(label: string): Promise<void> {
  const call = jest.mocked(Alert.alert).mock.calls.at(-1);
  const button = call?.[2]?.find((option) => option.text === label);
  await act(async () => {
    button?.onPress?.();
  });
}

async function pull(): Promise<void> {
  const { refreshControl } = screen.getByTestId("members-list").props;
  await act(async () => {
    await refreshControl.props.onRefresh();
  });
}

function calledWith(server: Server, method: string): string[] {
  return server.calls.filter((call) => call.method === method).map((call) => call.url);
}

beforeEach(() => {
  jest.restoreAllMocks();
  store.dispatch(baseApi.util.resetApiState());
  store.dispatch(workspaceChosen(null));
  jest.mocked(useToday).mockReturnValue(NOW);
  jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
});

afterAll(() => {
  api.defaults.adapter = originalAdapter;
});

describe("members display", () => {
  it("names people by name, then email", () => {
    expect(memberName(aMember())).toBe("Sam Lee");
    expect(memberFirstName(aMember())).toBe("Sam");
    expect(memberName(aMember({ user_name: null }))).toBe("sam@example.com");
    expect(memberFirstName(aMember({ user_name: "  " }))).toBe("sam@example.com");
  });

  it("counts the days an invite has left", () => {
    expect(inviteStatusLine(anInvite(), NOW)).toBe("Viewer · Expires in 5 days");
    expect(inviteStatusLine(anInvite({ expires_at: "2026-11-05T20:00:00Z" }), NOW)).toBe("Viewer · Expires in 1 day");
    expect(inviteStatusLine(anInvite({ expires_at: "2026-11-05T11:00:00Z", org_role: "admin" }), NOW)).toBe("Admin · Expired");
  });
});

describe("what each role sees", () => {
  it("shows an admin everyone, with invites and actions", async () => {
    serve({ invites: [anInvite()] });
    await show({ ...ACME, org_role: "admin" });
    expect(await screen.findByText(MESSAGES.people(2))).toBeTruthy();
    expect(await screen.findByText(MESSAGES.waiting(1))).toBeTruthy();
    expect(screen.getByText(MESSAGES.inviteSomeone)).toBeTruthy();
    expect(screen.getByText("Viewer · Expires in 5 days")).toBeTruthy();
  });

  it.each(["user", "viewer"] as const)("never asks for invites as a %s and offers no actions", async (org_role) => {
    const server = serve({ members: [aMember({ user_id: "u1", user_email: "me@example.com", org_role }), aMember({ id: "m3", user_id: "u3", user_email: "pat@example.com", user_name: "Pat" })] });
    await show({ ...ACME, org_role });
    expect(await screen.findByText(MESSAGES.onlyAdmins)).toBeTruthy();
    expect(screen.queryByText(MESSAGES.inviteSomeone)).toBeNull();
    expect(screen.getByTestId("member-u3").props.accessibilityRole).toBeUndefined();
    await fireEvent.press(screen.getByTestId("member-u3"));
    expect(screen.queryByText(MESSAGES.removeFrom("Acme"))).toBeNull();
    expect(calledWith(server, "GET")).not.toContain(`/organizations/${ORG}/invites`);
  });

  it("offers nothing on my own row or the owner's, and tags me whatever my email's case", async () => {
    serve({ members: [aMember({ id: "m1", user_id: "u1", org_role: "admin", user_email: "me@example.com" }), aMember({ id: "m9", user_id: "u9", org_role: "owner", user_email: "boss@example.com", user_name: "Boss" }), aMember()] });
    await show({ ...ACME, org_role: "admin" });
    await screen.findByText(MESSAGES.people(3));
    expect(screen.getByText(`  ${MESSAGES.you}`)).toBeTruthy();
    await fireEvent.press(screen.getByTestId("member-u1"));
    await fireEvent.press(screen.getByTestId("member-u9"));
    expect(screen.queryByText(MESSAGES.removeFrom("Acme"))).toBeNull();
    await fireEvent.press(screen.getByTestId("member-u2"));
    expect(screen.getByText(MESSAGES.removeFrom("Acme"))).toBeTruthy();
  });

  it("tells a demo workspace it can't invite", async () => {
    serve();
    await show({ ...ACME, is_demo: true });
    expect(await screen.findByText(MESSAGES.demoNote)).toBeTruthy();
    expect(screen.queryByText(MESSAGES.inviteSomeone)).toBeNull();
  });
});

describe("loading and failing", () => {
  it("shows a skeleton first", async () => {
    const server = serve();
    server.hanging = `GET /organizations/${ORG}/members`;
    await show();
    expect(screen.getByTestId("members-skeleton")).toBeTruthy();
    await act(async () => server.release?.());
  });

  it("doesn't read as empty when it can't reach the server, and recovers", async () => {
    const server = serve();
    server.refuse[`GET /organizations/${ORG}/members`] = {};
    await show();
    expect(await screen.findByText(MESSAGES.couldntLoad)).toBeTruthy();
    expect(screen.getByText(MESSAGES.checkConnection)).toBeTruthy();
    await press(MESSAGES.tryAgain);
    expect(await screen.findByText(MESSAGES.people(2))).toBeTruthy();
  });

  it("says it's on my side for a server error", async () => {
    const server = serve();
    server.refuse[`GET /organizations/${ORG}/members`] = { status: 500 };
    await show();
    expect(await screen.findByText(MESSAGES.tryAgainLater)).toBeTruthy();
  });

  it("keeps the list with a banner when a refresh fails", async () => {
    const server = serve();
    await show();
    await screen.findByText(MESSAGES.people(2));
    server.refuse[`GET /organizations/${ORG}/members`] = {};
    await pull();
    expect(await screen.findByText(SHOWING_LAST_LOADED_MESSAGE)).toBeTruthy();
    expect(screen.getByText("Sam Lee")).toBeTruthy();
  });

  it("shows people even when only the invites fail", async () => {
    const server = serve({ invites: [anInvite()] });
    server.refuse[`GET /organizations/${ORG}/invites`] = {};
    await show();
    expect(await screen.findByText(MESSAGES.couldntLoadInvites)).toBeTruthy();
    expect(screen.getByText("Sam Lee")).toBeTruthy();
    await press(MESSAGES.tryAgain);
    expect(await screen.findByText(MESSAGES.waiting(1))).toBeTruthy();
  });

  it("says when no one is waiting", async () => {
    serve();
    await show();
    expect(await screen.findByText(MESSAGES.noneWaiting)).toBeTruthy();
  });
});

describe("changing a role", () => {
  async function openSam(): Promise<void> {
    await screen.findByText(MESSAGES.people(2));
    await fireEvent.press(screen.getByTestId("member-u2"));
  }

  it("applies a downgrade right away and refreshes the list", async () => {
    const server = serve();
    await show();
    await openSam();
    await press("Viewer");
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(await screen.findByText(MESSAGES.roleChanged("Sam Lee", "a viewer"))).toBeTruthy();
    expect(server.members[1].org_role).toBe("viewer");
    await waitFor(() => expect(screen.getByLabelText("Sam Lee, Viewer")).toBeTruthy());
    expect(screen.getByText("sam@example.com")).toBeTruthy();
  });

  it("asks before making someone an admin, and does nothing on cancel", async () => {
    const server = serve();
    await show();
    await openSam();
    await press("Admin");
    expect(Alert.alert).toHaveBeenCalledWith(MESSAGES.promoteTitle("Sam Lee"), MESSAGES.promoteBody, expect.anything(), expect.anything());
    expect(calledWith(server, "PATCH")).toEqual([]);
    await pressAlertButton(MESSAGES.promoteConfirm);
    expect(await screen.findByText(MESSAGES.roleChanged("Sam Lee", "an admin"))).toBeTruthy();
    expect(server.members[1].org_role).toBe("admin");
  });

  it("does nothing when choosing the role they already have", async () => {
    const server = serve();
    await show();
    await openSam();
    await fireEvent.press(screen.getByRole("radio", { name: "User" }));
    expect(calledWith(server, "PATCH")).toEqual([]);
  });

  it("shows Saving on the row and fires once", async () => {
    const server = serve();
    server.hanging = `PATCH /organizations/${ORG}/members/u2/role`;
    await show();
    await openSam();
    await press("Viewer");
    expect(await screen.findByText(MESSAGES.saving)).toBeTruthy();
    await fireEvent.press(screen.getByTestId("member-u2"));
    expect(screen.queryByText(MESSAGES.removeFrom("Acme"))).toBeNull();
    expect(calledWith(server, "PATCH")).toHaveLength(1);
    await act(async () => server.release?.());
  });

  it("treats a lost answer as done when the role did change", async () => {
    const server = serve();
    const url = `/organizations/${ORG}/members/u2/role`;
    server.refuse[`PATCH ${url}`] = { thenApply: () => { server.members = [ME, aMember({ org_role: "viewer" })]; } };
    await show();
    await openSam();
    await press("Viewer");
    expect(await screen.findByText(MESSAGES.roleChanged("Sam Lee", "a viewer"))).toBeTruthy();
  });

  it("says it didn't go through when the role didn't change", async () => {
    const server = serve();
    server.refuse[`PATCH /organizations/${ORG}/members/u2/role`] = { status: 500 };
    await show();
    await openSam();
    await press("Viewer");
    expect(await screen.findByText(MESSAGES.didntGoThrough)).toBeTruthy();
  });

  it("says it's unsure when it can't check", async () => {
    const server = serve();
    server.refuse[`PATCH /organizations/${ORG}/members/u2/role`] = {};
    await show();
    await openSam();
    server.refuse[`GET /organizations/${ORG}/members`] = {};
    await press("Viewer");
    expect(await screen.findByText(MESSAGES.unsure)).toBeTruthy();
  });

  it("says when my own role changed, and asks for my workspaces again", async () => {
    const server = serve();
    server.refuse[`PATCH /organizations/${ORG}/members/u2/role`] = { status: 403, detail: "Insufficient permissions in this organization" };
    await show();
    await openSam();
    const before = calledWith(server, "GET").filter((url) => url === "/organizations").length;
    await press("Viewer");
    expect(await screen.findByText(MESSAGES.notAllowed)).toBeTruthy();
    await waitFor(() => expect(calledWith(server, "GET").filter((url) => url === "/organizations").length).toBeGreaterThan(before));
  });
});

describe("removing someone", () => {
  async function askToRemoveSam(): Promise<void> {
    await screen.findByText(MESSAGES.people(2));
    await fireEvent.press(screen.getByTestId("member-u2"));
    await press(MESSAGES.removeFrom("Acme"));
  }

  it("asks first, then removes", async () => {
    const server = serve();
    await show();
    await askToRemoveSam();
    expect(Alert.alert).toHaveBeenCalledWith(MESSAGES.removeTitle("Sam Lee"), MESSAGES.removeBody("Acme"), expect.anything(), expect.anything());
    expect(calledWith(server, "DELETE")).toEqual([]);
    await pressAlertButton(MESSAGES.removeConfirm("Sam"));
    expect(await screen.findByText(MESSAGES.removed("Sam Lee"))).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId("member-u2")).toBeNull());
  });

  it("says when they were already removed", async () => {
    const server = serve();
    server.refuse[`DELETE /organizations/${ORG}/members/u2`] = { status: 404, thenApply: () => { server.members = [ME]; } };
    await show();
    await askToRemoveSam();
    await pressAlertButton(MESSAGES.removeConfirm("Sam"));
    expect(await screen.findByText(MESSAGES.alreadyRemoved("Sam Lee"))).toBeTruthy();
  });

  it("treats a lost answer as done when they're gone", async () => {
    const server = serve();
    server.refuse[`DELETE /organizations/${ORG}/members/u2`] = { thenApply: () => { server.members = [ME]; } };
    await show();
    await askToRemoveSam();
    await pressAlertButton(MESSAGES.removeConfirm("Sam"));
    expect(await screen.findByText(MESSAGES.removed("Sam Lee"))).toBeTruthy();
  });
});

describe("inviting someone", () => {
  async function fillIn(email: string): Promise<void> {
    await press(MESSAGES.inviteSomeone);
    await fireEvent.changeText(screen.getByLabelText(new RegExp(MESSAGES.email)), email);
  }

  it("cleans up the address, defaults to User and sends", async () => {
    const server = serve();
    await show();
    await screen.findByText(MESSAGES.people(2));
    await fillIn("  New@Example.COM ");
    await press(MESSAGES.sendInvite);
    expect(await screen.findByText(MESSAGES.inviteSent("new@example.com"))).toBeTruthy();
    const post = server.calls.find((call) => call.method === "POST");
    expect(post?.body).toEqual({ email: "new@example.com", org_role: "user" });
    expect(screen.queryByText(MESSAGES.sendInvite)).toBeNull();
    expect(await screen.findByText(MESSAGES.waiting(1))).toBeTruthy();
  });

  it("sends the role I choose", async () => {
    const server = serve();
    await show();
    await screen.findByText(MESSAGES.people(2));
    await fillIn("new@example.com");
    await fireEvent.press(screen.getByRole("tab", { name: "Viewer" }));
    await press(MESSAGES.sendInvite);
    await screen.findByText(MESSAGES.inviteSent("new@example.com"));
    expect(server.calls.find((call) => call.method === "POST")?.body).toEqual({ email: "new@example.com", org_role: "viewer" });
  });

  it("won't send something that isn't an address", async () => {
    const server = serve();
    await show();
    await screen.findByText(MESSAGES.people(2));
    await fillIn("not an address");
    await press(MESSAGES.sendInvite);
    expect(await screen.findByText(MESSAGES.invalidEmail)).toBeTruthy();
    expect(calledWith(server, "POST")).toEqual([]);
  });

  it("stops me inviting someone already here, or already invited", async () => {
    const server = serve({ invites: [anInvite()] });
    await show();
    await screen.findByText(MESSAGES.waiting(1));
    await fillIn("SAM@example.com");
    await press(MESSAGES.sendInvite);
    expect(await screen.findByText(MESSAGES.alreadyIn("sam@example.com", "Acme"))).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText(new RegExp(MESSAGES.email)), "new@example.com");
    await press(MESSAGES.sendInvite);
    expect(await screen.findByText(MESSAGES.alreadyPending("new@example.com"))).toBeTruthy();
    expect(calledWith(server, "POST")).toEqual([]);
  });

  it("says when the server knows they've joined", async () => {
    const server = serve();
    server.refuse[`POST /organizations/${ORG}/invites`] = { status: 400, detail: ALREADY_MEMBER_DETAIL };
    await show();
    await screen.findByText(MESSAGES.people(2));
    await fillIn("new@example.com");
    await press(MESSAGES.sendInvite);
    expect(await screen.findByText(MESSAGES.alreadyIn("new@example.com", "Acme"))).toBeTruthy();
  });

  it("says when the invite was made but the email failed, and marks the row", async () => {
    serve({ createAnswer: { email_sent: false } });
    await show();
    await screen.findByText(MESSAGES.people(2));
    await fillIn("new@example.com");
    await press(MESSAGES.sendInvite);
    expect(await screen.findByText(MESSAGES.inviteEmailFailed("new@example.com"))).toBeTruthy();
    expect(await screen.findByText(MESSAGES.emailDidntSend)).toBeTruthy();
  });

  it("finds a lost answer went through", async () => {
    const server = serve();
    server.refuse[`POST /organizations/${ORG}/invites`] = { thenApply: () => { server.invites = [anInvite()]; } };
    await show();
    await screen.findByText(MESSAGES.people(2));
    await fillIn("new@example.com");
    await press(MESSAGES.sendInvite);
    expect(await screen.findByText(MESSAGES.inviteWentThrough)).toBeTruthy();
  });

  it("keeps the form when it couldn't send", async () => {
    const server = serve();
    server.refuse[`POST /organizations/${ORG}/invites`] = {};
    await show();
    await screen.findByText(MESSAGES.people(2));
    await fillIn("new@example.com");
    await press(MESSAGES.sendInvite);
    expect(await screen.findByText(MESSAGES.couldntSend)).toBeTruthy();
    expect(screen.getByDisplayValue("new@example.com")).toBeTruthy();
  });

  it("doesn't mistake an older invite for the one that just failed", async () => {
    const server = serve({ invites: [anInvite({ expires_at: "2026-11-01T00:00:00Z" })] });
    server.refuse[`POST /organizations/${ORG}/invites`] = {};
    await show();
    await press(MESSAGES.inviteAgain);
    await press(MESSAGES.sendInvite);
    expect(await screen.findByText(MESSAGES.couldntSend)).toBeTruthy();
    expect(screen.queryByText(MESSAGES.inviteWentThrough)).toBeNull();
  });

  it("lets me send a pending invite again from its row", async () => {
    const server = serve({ invites: [anInvite()] });
    await show();
    await press(MESSAGES.inviteAgain);
    await press(MESSAGES.sendInvite);
    expect(await screen.findByText(MESSAGES.inviteSent("new@example.com"))).toBeTruthy();
    expect(calledWith(server, "POST")).toHaveLength(1);
  });

  it("frees the form and closes it if my role changes while it's open", async () => {
    serve();
    await render(
      <Provider store={store}>
        <ToastProvider bottomOffset={0}>
          <MembersScreen workspace={ACME} />
        </ToastProvider>
      </Provider>,
    );
    await screen.findByText(MESSAGES.people(2));
    await press(MESSAGES.inviteSomeone);
    await screen.rerender(
      <Provider store={store}>
        <ToastProvider bottomOffset={0}>
          <MembersScreen workspace={{ ...ACME, org_role: "user" }} />
        </ToastProvider>
      </Provider>,
    );
    expect(screen.queryByText(MESSAGES.sendInvite)).toBeNull();
  });

  it("holds other rows while something is in flight", async () => {
    const server = serve({ members: [ME, aMember(), aMember({ id: "m3", user_id: "u3", user_name: "Pat", user_email: "pat@example.com" })] });
    server.hanging = `PATCH /organizations/${ORG}/members/u2/role`;
    await show();
    await screen.findByText(MESSAGES.people(3));
    await fireEvent.press(screen.getByTestId("member-u2"));
    await press("Viewer");
    await screen.findByText(MESSAGES.saving);
    await fireEvent.press(screen.getByTestId("member-u3"));
    expect(screen.queryByText(MESSAGES.removeFrom("Acme"))).toBeNull();
    await act(async () => server.release?.());
  });

  it("sends once however many times it's pressed", async () => {
    const server = serve();
    server.hanging = `POST /organizations/${ORG}/invites`;
    await show();
    await screen.findByText(MESSAGES.people(2));
    await fillIn("new@example.com");
    await press(MESSAGES.sendInvite);
    expect(await screen.findByText(MESSAGES.sending)).toBeTruthy();
    await fireEvent.press(screen.getByText(MESSAGES.sending));
    expect(calledWith(server, "POST")).toHaveLength(1);
    await act(async () => server.release?.());
  });

  it("fills in the form again from an expired invite and lets it through", async () => {
    const server = serve({ invites: [anInvite({ expires_at: "2026-11-01T00:00:00Z", org_role: "admin" })] });
    await show();
    expect(await screen.findByText("Admin · Expired")).toBeTruthy();
    await press(MESSAGES.inviteAgain);
    expect(screen.getByDisplayValue("new@example.com")).toBeTruthy();
    await press(MESSAGES.sendInvite);
    await screen.findByText(MESSAGES.inviteSent("new@example.com"));
    expect(server.calls.find((call) => call.method === "POST")?.body).toEqual({ email: "new@example.com", org_role: "admin" });
  });
});

describe("cancelling an invite", () => {
  it("cancels and says so", async () => {
    serve({ invites: [anInvite()] });
    await show();
    await press(MESSAGES.cancelInvite);
    expect(await screen.findByText(MESSAGES.inviteCancelled("new@example.com"))).toBeTruthy();
    expect(await screen.findByText(MESSAGES.waiting(0))).toBeTruthy();
  });

  it("says when it's already gone", async () => {
    const server = serve({ invites: [anInvite()] });
    server.refuse[`DELETE /organizations/${ORG}/invites/i1`] = { status: 404, thenApply: () => { server.invites = []; } };
    await show();
    await press(MESSAGES.cancelInvite);
    expect(await screen.findByText(MESSAGES.inviteGone)).toBeTruthy();
  });

  it("checks after a failure", async () => {
    const server = serve({ invites: [anInvite()] });
    server.refuse[`DELETE /organizations/${ORG}/invites/i1`] = { status: 500 };
    await show();
    await press(MESSAGES.cancelInvite);
    expect(await screen.findByText(MESSAGES.didntGoThrough)).toBeTruthy();
  });

  it("fires once", async () => {
    const server = serve({ invites: [anInvite()] });
    server.hanging = `DELETE /organizations/${ORG}/invites/i1`;
    await show();
    await press(MESSAGES.cancelInvite);
    expect(await screen.findByText(MESSAGES.cancelling)).toBeTruthy();
    await fireEvent.press(screen.getByText(MESSAGES.cancelling));
    expect(calledWith(server, "DELETE")).toHaveLength(1);
    await act(async () => server.release?.());
  });
});

describe("losing access", () => {
  function ActiveId() {
    const activeId = useSelector((state: RootState) => state.workspace.activeId);
    return <Text testID="active">{activeId}</Text>;
  }

  async function showGated(): Promise<void> {
    await render(
      <Provider store={store}>
        <WorkspaceGate>
          <ToastProvider bottomOffset={0}>
            <WorkspaceLostToast />
            <ActiveId />
          </ToastProvider>
        </WorkspaceGate>
      </Provider>,
    );
  }

  it("moves me to another workspace, says so and drops what was cached", async () => {
    const other: Workspace = { id: "org2", name: "Other", org_role: "user", is_demo: false };
    const server = serve({ workspaces: [ACME, other] });
    await showGated();
    await waitFor(() => expect(screen.getByTestId("active").props.children).toBe(ORG));
    await act(async () => {
      await store.dispatch(membersApi.endpoints.listMembers.initiate(ORG));
    });
    server.workspaces = [other];
    await act(async () => {
      await store.dispatch(workspaceApi.endpoints.listWorkspaces.initiate(undefined, { forceRefetch: true }));
    });
    expect(await screen.findByText(MESSAGES.workspaceLost("Acme", "Other"))).toBeTruthy();
    expect(screen.getByTestId("active").props.children).toBe("org2");
    expect(Object.keys(store.getState().api.queries).filter((key) => key.startsWith("listMembers"))).toEqual([]);
  });

  it("stays quiet the first time a workspace is chosen", async () => {
    serve();
    await showGated();
    await waitFor(() => expect(screen.getByTestId("active").props.children).toBe(ORG));
    expect(screen.queryByText(/no longer have access/)).toBeNull();
  });

  it("asks for my workspaces when the members list refuses me", async () => {
    const server = serve();
    server.refuse[`GET /organizations/${ORG}/members`] = { status: 403, detail: NOT_A_MEMBER_DETAIL };
    await show();
    await waitFor(() => expect(calledWith(server, "GET").filter((url) => url === "/organizations").length).toBeGreaterThan(0));
  });
});
