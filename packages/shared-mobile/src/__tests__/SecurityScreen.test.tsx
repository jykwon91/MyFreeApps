import { _resetPlatformForTests, configurePlatform } from "@platform/core/platform/configurePlatform";
import { baseApi } from "@platform/core/store/baseApi";
import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Provider } from "react-redux";
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
