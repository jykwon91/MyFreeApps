import { clearLastAnalysis } from "@myjobhunter/api-client/store/jobAnalysisSlice";
import { baseApi } from "@platform/core/store/baseApi";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import { ANALYZE_MESSAGES as MESSAGES } from "../src/constants/analyze";
import { store } from "../src/lib/store";
import { analyzeRoutes } from "../test-support/analyzeRoutes";
import { serve } from "@platform/mobile/test-support/fakeServer";
import { heldReplies } from "../test-support/heldReplies";
import { storedItems } from "@platform/mobile/test-support/memorySecureStore";
import { renderApp } from "../test-support/renderApp";
import { storeSession } from "@platform/mobile/test-support/storedSession";

jest.mock("expo-secure-store", () => jest.requireActual("@platform/mobile/test-support/memorySecureStore"));
jest.mock("expo-application", () => jest.requireActual("@platform/mobile/test-support/fakeApplication"));
jest.mock("expo-device", () => ({ deviceName: "Test Phone", modelName: "iPhone" }));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);

const LINK = "https://jobs.example.com/posting/123";

beforeEach(() => {
  storedItems.clear();
  storeSession();
  store.dispatch(baseApi.util.resetApiState());
  store.dispatch(clearLastAnalysis());
});

// Signing out ends the app's session for the rest of the file, so it holds this one test.
describe("signing out while an analysis runs", () => {
  it("says nothing of it failing afterwards, to this account or the next", async () => {
    const held = heldReplies();
    serve(analyzeRoutes({ "POST /jobs/analyze": held.route, "POST /auth/mobile/logout": () => ({ status: 204 }) }));
    await renderApp("/more");
    await fireEvent.press(await screen.findByRole("button", { name: "Analyze a job" }));
    await fireEvent.changeText(await screen.findByLabelText(MESSAGES.linkLabel), LINK);
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.analyze }));
    await screen.findByTestId("analyze-progress");
    await act(async () => router.back());
    await waitFor(() => expect(screen).toHavePathname("/more"));

    await fireEvent.press(await screen.findByRole("button", { name: "Sign out of this phone" }));
    await screen.findByLabelText("Password");
    await held.answer(0, { status: 504, data: { detail: "boom" } });

    expect(screen.queryByText(MESSAGES.couldntAnalyze, { exact: false })).toBeNull();
    expect(store.getState().jobAnalysis.failure).toBeNull();
  });
});
