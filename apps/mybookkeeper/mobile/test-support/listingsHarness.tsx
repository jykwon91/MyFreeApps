import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { render } from "@testing-library/react-native";
import { Alert } from "react-native";
import { Provider } from "react-redux";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";

export const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn() };
export const mockPreventRemove = { active: false, callback: null as null | ((event: { repeat: () => void }) => void) };

/** What `jest.mock("expo-router", ...)` returns: the router calls and the leave guard are kept for the test to read. */
export function expoRouterMock() {
  return {
    useFocusEffect: () => undefined,
    router: { push: (path: string) => mockRouter.push(path), back: () => mockRouter.back(), replace: (path: string) => mockRouter.replace(path), canGoBack: () => true },
    usePreventRemove: (active: boolean, callback: (event: { repeat: () => void }) => void) => {
      mockPreventRemove.active = active;
      mockPreventRemove.callback = callback;
    },
  };
}

const originalAdapter = api.defaults.adapter;

export function signInToWorkspace(): jest.SpyInstance {
  session.tokenStore.set("token");
  store.dispatch(baseApi.util.resetApiState());
  store.dispatch(workspaceChosen("w1"));
  jest.clearAllMocks();
  return jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
}

export function restoreApi(): void {
  api.defaults.adapter = originalAdapter;
  jest.restoreAllMocks();
}

export async function show(element: React.ReactElement) {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>{element}</ToastProvider>
    </Provider>,
  );
}

/** Presses the alert button with this text, as the person would. */
export async function pressAlertButton(alertSpy: jest.SpyInstance, text: string, act: (fn: () => Promise<void>) => Promise<unknown>): Promise<void> {
  const buttons = alertSpy.mock.calls.at(-1)?.[2] as { text: string; onPress?: () => void }[];
  await act(async () => buttons.find((candidate) => candidate.text === text)?.onPress?.());
}
