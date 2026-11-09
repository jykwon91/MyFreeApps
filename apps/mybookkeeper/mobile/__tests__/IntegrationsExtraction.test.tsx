import { documentsApi } from "@mybookkeeper/api-client/store/documentsApi";
import api from "@platform/core/lib/api";
import { act, screen, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import IntegrationsScreen from "../src/features/integrations/IntegrationsScreen";
import { store } from "../src/lib/store";
import { aQueueItem, aSyncLog, startIntegrationsServer } from "../test-support/integrationsServer";
import { renderScreen, resetSignedInStore } from "../test-support/renderScreen";

jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  router: { push: jest.fn(), back: jest.fn() },
}));

const originalAdapter = api.defaults.adapter;

beforeEach(() => {
  resetSignedInStore();
  jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  jest.restoreAllMocks();
});

async function refreshScreen() {
  await act(async () => {
    await screen.getByTestId("integrations-list").props.refreshControl.props.onRefresh();
  });
}

describe("when extraction finishes while the screen is open", () => {
  it("reloads the documents it produced", async () => {
    const server = startIntegrationsServer({ logs: [aSyncLog()], queue: [aQueueItem({ status: "extracting" })] });
    await renderScreen(<IntegrationsScreen />);
    await screen.findByText("1 extracting");
    await act(async () => {
      store.dispatch(documentsApi.endpoints.getDocuments.initiate({}));
    });
    await waitFor(() => expect(server.documentReads).toBe(1));

    server.queue = [aQueueItem({ status: "done" })];
    await refreshScreen();
    await screen.findByText("All 1 email processed");
    await waitFor(() => expect(server.documentReads).toBe(2));
  });

  it("leaves them alone while nothing has finished", async () => {
    const server = startIntegrationsServer({ logs: [aSyncLog()], queue: [aQueueItem({ status: "fetched" })] });
    await renderScreen(<IntegrationsScreen />);
    await screen.findByText("1 ready to extract");
    await act(async () => {
      store.dispatch(documentsApi.endpoints.getDocuments.initiate({}));
    });
    await waitFor(() => expect(server.documentReads).toBe(1));
    await refreshScreen();
    await screen.findByText("1 ready to extract");
    expect(server.documentReads).toBe(1);
  });
});
