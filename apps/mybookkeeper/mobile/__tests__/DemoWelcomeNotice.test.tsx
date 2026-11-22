import { baseApi } from "@platform/core/store/baseApi";
import { act, fireEvent, screen } from "@testing-library/react-native";
import { DEMO_WELCOME_DISMISS, DEMO_WELCOME_TITLE } from "@mybookkeeper/api-client/constants/demoWelcome";
import { DEMO_WELCOME_FILE } from "../src/constants/demoWelcome";
import { store } from "../src/lib/store";
import { startTransactionServer } from "../test-support/transactionsServer";
import { renderHome, resetHome } from "../test-support/homeScreen";
import { answerRequest } from "../test-support/homeScreen";
import { File, fakeFiles, resetFakeFiles } from "@platform/mobile/test-support/fakeFileSystem";

jest.mock("expo-file-system", () => jest.requireActual("@platform/mobile/test-support/fakeFileSystem"));
jest.mock("expo-router", () => ({
  router: { navigate: jest.fn(), push: jest.fn() },
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = jest.requireActual("react");
    useEffect(callback, [callback]);
  },
}));

function workspaces(isDemo: boolean): () => void {
  return answerRequest("/organizations", [
    { id: "w1", name: "My workspace", org_role: "owner", is_demo: isDemo, created_at: "2024-01-01T00:00:00Z" },
  ]);
}

let restore: () => void = () => {};

beforeEach(() => {
  resetFakeFiles();
  resetHome();
  startTransactionServer([]);
});

afterEach(() => {
  restore();
  store.dispatch(baseApi.util.resetApiState());
});

describe("the demo workspace welcome on Home", () => {
  it("shows in a demo workspace", async () => {
    restore = workspaces(true);
    await renderHome();
    expect(await screen.findByText(DEMO_WELCOME_TITLE)).toBeTruthy();
    expect(screen.getByText(/Upload your own documents/)).toBeTruthy();
  });

  it("doesn't show in a normal workspace", async () => {
    restore = workspaces(false);
    await renderHome();
    expect(await screen.findByText("Approved transactions only.")).toBeTruthy();
    expect(screen.queryByText(DEMO_WELCOME_TITLE)).toBeNull();
  });

  it("stays dismissed once dismissed, even after reopening Home", async () => {
    restore = workspaces(true);
    await renderHome();
    await fireEvent.press(await screen.findByRole("button", { name: DEMO_WELCOME_DISMISS }));
    expect(screen.queryByText(DEMO_WELCOME_TITLE)).toBeNull();
    expect(fakeFiles()).toContain(new File("doc:", DEMO_WELCOME_FILE).uri);
    await act(async () => {});
    await renderHome();
    expect(screen.queryByText(DEMO_WELCOME_TITLE)).toBeNull();
  });

  it("doesn't show when it was dismissed on an earlier visit", async () => {
    new File("doc:", DEMO_WELCOME_FILE).create();
    restore = workspaces(true);
    await renderHome();
    expect(await screen.findByText("Approved transactions only.")).toBeTruthy();
    expect(screen.queryByText(DEMO_WELCOME_TITLE)).toBeNull();
  });
});
