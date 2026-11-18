import { _resetPlatformForTests, configurePlatform } from "@platform/core/platform/configurePlatform";
import { baseApi } from "@platform/core/store/baseApi";
import { configureStore } from "@reduxjs/toolkit";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Provider } from "react-redux";
import { nodesOfType } from "../../test-support/renderedNodes";
import type { FakeReply } from "../../test-support/types/FakeReply";
import type { RenderedNode } from "../../test-support/types/RenderedNode";
import { serve } from "../../test-support/fakeServer";
import { fetchTwoFactorEnabled } from "../auth/mobileAuthApi";
import SecurityScreen from "../components/SecurityScreen";
import ToastProvider from "../components/ToastProvider";
import { SECURITY_MESSAGES as MESSAGES } from "../constants/security";
import type { MobileSession } from "../types/MobileSession";

jest.mock("../auth/mobileAuthApi");
jest.mock("expo-secure-store", () => jest.requireActual("../../test-support/memorySecureStore"));
jest.mock("expo-file-system", () => jest.requireActual("../../test-support/fakeFileSystem"));
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn() }));

const USER = { id: "u1", email: "me@example.com", display_name: "Jane", totp_enabled: false, is_verified: true, is_superuser: false };
const CONTENT = { intro: "Turn it on.", whatTwoStepProtects: "your things", displayNameDescription: "Where it shows.", exportDescription: "A copy." };
const session = { tokenStore: { get: () => "token" } } as unknown as MobileSession;

function makeStore() {
  return configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer },
    middleware: (getDefault) => getDefault().concat(baseApi.middleware),
  });
}

function Security({ store }: { store: ReturnType<typeof makeStore> }) {
  return (
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <SecurityScreen
          content={CONTENT}
          dataExport={{ apiBaseUrl: "https://api.test", session, filePrefix: "app-export" }}
          introDismissedKey="intro"
          onDeleteAccount={jest.fn()}
          onTurnOn={jest.fn()}
          reloadSignal={0}
        />
      </ToastProvider>
    </Provider>
  );
}

beforeEach(() => {
  _resetPlatformForTests();
  configurePlatform({
    baseURL: "https://api.test",
    tokenStore: { get: () => "token", set: () => {}, clear: () => {} },
    orgStore: { get: () => null },
    isOnLogin: () => false,
    refreshSession: async () => "unavailable",
  });
  jest.mocked(fetchTwoFactorEnabled).mockResolvedValue(false);
});

it("shows the saved name when opened again, before the account is read again", async () => {
  let reads = 0;
  serve({
    "GET /users/me": () => {
      reads += 1;
      // Only the first read answers, so the reopened screen can show only what the save left.
      return reads === 1 ? { status: 200, data: USER } : new Promise(() => undefined);
    },
    "PATCH /users/me": (body) => ({ status: 200, data: { ...USER, ...body } }),
  });
  const store = makeStore();
  const first = await render(<Security store={store} />);
  await fireEvent.changeText(await screen.findByDisplayValue(USER.display_name), "Jane Smith");
  await fireEvent.press(screen.getByRole("button", { name: MESSAGES.save }));
  await screen.findByText(MESSAGES.displayNameSaved);
  await first.unmount();

  await render(<Security store={store} />);
  expect(await screen.findByDisplayValue("Jane Smith")).toBeTruthy();
  expect(screen.getByRole("button", { name: MESSAGES.save }).props.accessibilityState?.disabled).toBe(true);
});

it("scrolls the name field above the keyboard and keeps a tap on Save working", async () => {
  serve({ "GET /users/me": () => ({ status: 200, data: USER }) });
  await render(<Security store={makeStore()} />);
  await screen.findByDisplayValue(USER.display_name);
  const [scroll] = nodesOfType(screen.toJSON() as RenderedNode | null, "RCTScrollView");
  expect(scroll.props.bottomOffset).toBeGreaterThan(0);
  expect(scroll.props.keyboardShouldPersistTaps).toBe("handled");
});

it("saves the name when the keyboard's return key is pressed", async () => {
  const saved: unknown[] = [];
  serve({
    "GET /users/me": () => ({ status: 200, data: USER }),
    "PATCH /users/me": (body) => {
      saved.push(body);
      return { status: 200, data: { ...USER, ...body } };
    },
  });
  await render(<Security store={makeStore()} />);
  const field = await screen.findByDisplayValue(USER.display_name);
  await fireEvent(field, "submitEditing");
  expect(saved).toEqual([]);
  await fireEvent.changeText(field, "Jane Smith");
  await fireEvent(field, "submitEditing");
  await screen.findByText(MESSAGES.displayNameSaved);
  expect(saved).toEqual([{ display_name: "Jane Smith" }]);
});

it("says when the name couldn't be saved", async () => {
  serve({
    "GET /users/me": () => ({ status: 200, data: USER }),
    "PATCH /users/me": () => ({ status: 400, data: { detail: "UPDATE_USER_INVALID" } }),
  });
  await render(<Security store={makeStore()} />);
  await fireEvent.changeText(await screen.findByDisplayValue(USER.display_name), "Jane Smith");
  await fireEvent.press(screen.getByRole("button", { name: MESSAGES.save }));
  expect(await screen.findByRole("alert", { name: MESSAGES.displayNameSaveFailed })).toBeTruthy();
});

it("doesn't call a name save whose answer was lost a failure: it may have saved, and saving again is safe", async () => {
  serve({
    "GET /users/me": () => ({ status: 200, data: USER }),
    "PATCH /users/me": () => ({ status: 502, data: "<html>Bad Gateway</html>" }),
  });
  await render(<Security store={makeStore()} />);
  await fireEvent.changeText(await screen.findByDisplayValue(USER.display_name), "Jane Smith");
  await fireEvent.press(screen.getByRole("button", { name: MESSAGES.save }));
  expect(await screen.findByRole("alert", { name: MESSAGES.displayNameSaveUnsure })).toBeTruthy();
  expect(screen.queryByRole("alert", { name: MESSAGES.displayNameSaveFailed })).toBeNull();
  // What was typed stays, ready to save again.
  expect(screen.getByRole("button", { name: MESSAGES.save })).toBeEnabled();
});

it("says nothing about a name save that signing out called off", async () => {
  const sent: unknown[] = [];
  let answer: (reply: FakeReply) => void = () => undefined;
  serve({
    "GET /users/me": () => ({ status: 200, data: USER }),
    "PATCH /users/me": (body) => {
      sent.push(body);
      return new Promise<FakeReply>((resolve) => (answer = resolve));
    },
  });
  const store = makeStore();
  await render(<Security store={store} />);
  await fireEvent.changeText(await screen.findByDisplayValue(USER.display_name), "Jane Smith");
  await fireEvent.press(screen.getByRole("button", { name: MESSAGES.save }));
  await waitFor(() => expect(sent).toHaveLength(1));

  // What signing out or changing account does to the cache: RTK Query aborts the save on its way.
  await act(async () => {
    store.dispatch(baseApi.util.resetApiState());
  });
  await act(async () => {
    answer({ status: 500, data: {} });
  });

  expect(screen.queryByRole("alert", { name: MESSAGES.displayNameSaveFailed })).toBeNull();
});
