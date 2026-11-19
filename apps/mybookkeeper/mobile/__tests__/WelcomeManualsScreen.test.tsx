import api from "@platform/core/lib/api";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { SHOWING_LAST_LOADED_MESSAGE } from "@platform/mobile";
import type { AxiosAdapter } from "axios";
import { WELCOME_MANUAL_PAGE_SIZE } from "@mybookkeeper/api-client/constants/welcomeManualLimits";
import { WELCOME_MANUAL_MESSAGES } from "../src/constants/welcomeManuals";
import WelcomeManualsScreen from "../src/features/welcomeManuals/WelcomeManualsScreen";
import { aManual } from "../test-support/aWelcomeManual";
import { holdReads } from "../test-support/holdReads";
import { renderScreen, resetSignedInStore } from "../test-support/renderScreen";
import { startWelcomeManualsServer, type WelcomeManualsServer } from "../test-support/welcomeManualsServer";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  router: { push: (path: string) => mockPush(path), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  usePreventRemove: () => undefined,
}));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const originalAdapter = api.defaults.adapter;

beforeEach(() => {
  resetSignedInStore();
  jest.clearAllMocks();
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
});

const manyManuals = (count: number) => Array.from({ length: count }, (_, index) => aManual({ id: `m${index}`, title: `Guide ${index}` }));

const listParams = (server: WelcomeManualsServer) =>
  server.requests.filter((request) => request.url === "/welcome-manuals").map((request) => request.params as { limit: number; offset: number });
const reachEnd = async () => {
  await act(async () => {
    await screen.getByTestId("welcome-manuals-list").props.onEndReached();
  });
};

describe("the manuals list", () => {
  it("shows a skeleton while the first answer is on its way", async () => {
    startWelcomeManualsServer();
    holdReads();
    await renderScreen(<WelcomeManualsScreen />);
    expect(await screen.findByTestId("welcome-manuals-skeleton")).toBeTruthy();
  });

  it("lists a manual with its property and section count, and opens it", async () => {
    startWelcomeManualsServer({ manuals: [aManual({ property_id: "pr1" })] });
    await renderScreen(<WelcomeManualsScreen />);
    await screen.findByText("Beach House guide");
    await screen.findByText("Oak Street");
    expect(screen.getByText(/^0 sections · Updated /)).toBeTruthy();
    expect(screen.getByText(WELCOME_MANUAL_MESSAGES.noSectionsChip)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: /^Beach House guide, Oak Street/ }));
    expect(mockPush).toHaveBeenCalledWith("/welcome-manuals/m1");
  });

  it("starts a new manual from the top of the list", async () => {
    startWelcomeManualsServer({ manuals: [aManual()] });
    await renderScreen(<WelcomeManualsScreen />);
    await fireEvent.press(await screen.findByRole("button", { name: WELCOME_MANUAL_MESSAGES.new }));
    expect(mockPush).toHaveBeenCalledWith("/welcome-manuals/new");
  });

  it("offers to make the first one when there are none", async () => {
    startWelcomeManualsServer();
    await renderScreen(<WelcomeManualsScreen />);
    await screen.findByText(WELCOME_MANUAL_MESSAGES.noneHeading);
    expect(screen.getByText(WELCOME_MANUAL_MESSAGES.noneBody)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: WELCOME_MANUAL_MESSAGES.new }));
    expect(mockPush).toHaveBeenCalledWith("/welcome-manuals/new");
  });

  it("gives a viewer no way to make one", async () => {
    startWelcomeManualsServer({ role: "viewer" });
    await renderScreen(<WelcomeManualsScreen />);
    await screen.findByText(WELCOME_MANUAL_MESSAGES.noneViewOnlyBody);
    expect(screen.queryByRole("button", { name: WELCOME_MANUAL_MESSAGES.new })).toBeNull();
  });

  it("loads the next page when the list is scrolled to the end", async () => {
    const server = startWelcomeManualsServer({ manuals: manyManuals(30) });
    await renderScreen(<WelcomeManualsScreen />);
    await screen.findByText("Guide 0");
    await reachEnd();
    await waitFor(() => expect(screen.getByTestId("welcome-manuals-list").props.data).toHaveLength(30));
    expect(listParams(server)).toEqual([
      { limit: WELCOME_MANUAL_PAGE_SIZE, offset: 0 },
      { limit: WELCOME_MANUAL_PAGE_SIZE, offset: WELCOME_MANUAL_PAGE_SIZE },
    ]);
  });

  it("keeps loading a page at a time past 100 manuals, never asking for more than the server answers", async () => {
    const server = startWelcomeManualsServer({ manuals: manyManuals(130) });
    await renderScreen(<WelcomeManualsScreen />);
    await screen.findByText("Guide 0");
    for (let loaded = WELCOME_MANUAL_PAGE_SIZE; loaded < 130; loaded += WELCOME_MANUAL_PAGE_SIZE) {
      await reachEnd();
      await waitFor(() => expect(screen.getByTestId("welcome-manuals-list").props.data).toHaveLength(Math.min(loaded + WELCOME_MANUAL_PAGE_SIZE, 130)));
    }
    expect(listParams(server).map((params) => params.offset)).toEqual([0, 25, 50, 75, 100, 125]);
    expect(listParams(server).every((params) => params.limit === WELCOME_MANUAL_PAGE_SIZE)).toBe(true);
    expect(screen.queryByText(WELCOME_MANUAL_MESSAGES.couldntLoadList)).toBeNull();
    expect(screen.queryByText("I couldn't load more.")).toBeNull();
  });

  it("offers a retry when the first load fails, and recovers", async () => {
    const server = startWelcomeManualsServer({ manuals: [aManual()] });
    server.failReadsWith = 500;
    await renderScreen(<WelcomeManualsScreen />);
    await screen.findByText(WELCOME_MANUAL_MESSAGES.couldntLoadList);
    expect(screen.queryByText(WELCOME_MANUAL_MESSAGES.noneHeading)).toBeNull();
    server.failReadsWith = null;
    await fireEvent.press(screen.getByRole("button", { name: WELCOME_MANUAL_MESSAGES.tryAgain }));
    await screen.findByText("Beach House guide");
  });

  it("keeps what it had and says so when a pull to refresh fails", async () => {
    const server = startWelcomeManualsServer({ manuals: [aManual()] });
    await renderScreen(<WelcomeManualsScreen />);
    await screen.findByText("Beach House guide");
    server.failReadsWith = 500;
    await act(async () => {
      await screen.getByTestId("welcome-manuals-list").props.refreshControl.props.onRefresh();
    });
    await screen.findByText(SHOWING_LAST_LOADED_MESSAGE);
    expect(screen.getByText("Beach House guide")).toBeTruthy();
  });

  it("shows a retry after a failed load-more, and asks for that same page once when it is tapped", async () => {
    const server = startWelcomeManualsServer({ manuals: manyManuals(30) });
    await renderScreen(<WelcomeManualsScreen />);
    await screen.findByText("Guide 0");
    server.failReadsWith = 500;
    await reachEnd();
    await screen.findByText("I couldn't load more.");

    server.failReadsWith = null;
    const answer = api.defaults.adapter as AxiosAdapter;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let retries = 0;
    api.defaults.adapter = (config) => {
      if (config.url !== "/welcome-manuals") return answer(config);
      retries += 1;
      return gate.then(() => answer(config));
    };
    await fireEvent.press(screen.getByRole("button", { name: WELCOME_MANUAL_MESSAGES.tryAgain }));
    // While the page is on its way the retry gives way to a skeleton row, so it can't be tapped twice.
    await waitFor(() => expect(screen.queryByRole("button", { name: WELCOME_MANUAL_MESSAGES.tryAgain })).toBeNull());
    expect(screen.getByLabelText(WELCOME_MANUAL_MESSAGES.loadingMore)).toBeTruthy();
    expect(retries).toBe(1);

    release();
    await waitFor(() => expect(screen.getByTestId("welcome-manuals-list").props.data).toHaveLength(30));
    expect(screen.queryByText("I couldn't load more.")).toBeNull();
    expect(screen.queryByLabelText(WELCOME_MANUAL_MESSAGES.loadingMore)).toBeNull();
    expect(listParams(server).at(-1)).toEqual({ limit: WELCOME_MANUAL_PAGE_SIZE, offset: WELCOME_MANUAL_PAGE_SIZE });
  });
});
