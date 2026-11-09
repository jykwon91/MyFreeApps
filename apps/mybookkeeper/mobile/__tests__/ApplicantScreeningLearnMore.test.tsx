import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Linking } from "react-native";
import { Provider } from "react-redux";
import ApplicantDetailScreen from "../src/features/applicants/ApplicantDetailScreen";
import { workspaceChosen } from "../src/features/workspace/workspaceSlice";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { anApplicant, SAMPLE_PROVIDER, startApplicantServer } from "../test-support/applicantsServer";

jest.mock("expo-router", () => ({ useFocusEffect: () => undefined, router: { push: jest.fn(), back: jest.fn() } }));
jest.mock("expo-local-authentication", () => ({ SecurityLevel: { NONE: 0 }, authenticateAsync: jest.fn(), getEnrolledLevelAsync: jest.fn() }));
jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn() }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const originalAdapter = api.defaults.adapter;
const LEARN_MORE = { name: "Learn more about KeyCheck" };

async function renderScreen() {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <ApplicantDetailScreen id="a1" />
      </ToastProvider>
    </Provider>,
  );
}

describe("learning more about a screening provider", () => {
  beforeEach(() => {
    session.tokenStore.set("token");
    store.dispatch(baseApi.util.resetApiState());
    store.dispatch(workspaceChosen("w1"));
    startApplicantServer([anApplicant()]);
  });

  afterEach(() => {
    api.defaults.adapter = originalAdapter;
    jest.restoreAllMocks();
  });

  it("opens the provider's own page without saying a check was started", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", LEARN_MORE));
    expect(openURL).toHaveBeenCalledWith(SAMPLE_PROVIDER.external_url);
    expect(screen.queryByText(/I opened KeyCheck/)).toBeNull();
  });

  it("says when the phone can't open the page", async () => {
    jest.spyOn(Linking, "openURL").mockRejectedValue(new Error("no"));
    await renderScreen();
    await fireEvent.press(await screen.findByRole("button", LEARN_MORE));
    expect(await screen.findByText("I couldn't open that on this phone.")).toBeTruthy();
  });
});
