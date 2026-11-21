import api from "@platform/core/lib/api";
import { screen } from "@testing-library/react-native";
import { INTEGRATIONS_MESSAGES as MESSAGES } from "../src/constants/integrations";
import SyncSessionScreen from "../src/features/integrations/SyncSessionScreen";
import { aQueueItem, aSyncLog, startIntegrationsServer } from "../test-support/integrationsServer";
import { isInsideAccessibleElement } from "../test-support/isInsideAccessibleElement";
import { renderScreen, resetSignedInStore } from "../test-support/renderScreen";

jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  router: { push: jest.fn(), back: jest.fn(), canGoBack: () => true },
}));

const originalAdapter = api.defaults.adapter;

beforeEach(() => resetSignedInStore());
afterEach(() => {
  api.defaults.adapter = originalAdapter;
});

describe("a queued email row", () => {
  it("keeps Retry and Dismiss separately reachable, outside the labelled facts", async () => {
    startIntegrationsServer({ logs: [aSyncLog()], queue: [aQueueItem({ id: "c", status: "failed", error: "bad pdf" })] });
    await renderScreen(<SyncSessionScreen id={1} />);

    const retry = await screen.findByRole("button", { name: MESSAGES.retry });
    const dismiss = screen.getByRole("button", { name: MESSAGES.dismiss });

    expect(isInsideAccessibleElement(retry)).toBe(false);
    expect(isInsideAccessibleElement(dismiss)).toBe(false);
    expect(screen.getByLabelText(/failed, bad pdf/i)).toBeTruthy();
  });
});
