import { ToastProvider } from "@platform/mobile";
import { render } from "@testing-library/react-native";
import { Provider } from "react-redux";
import DiscoverScreen from "../src/features/discover/DiscoverScreen";
import { store } from "../src/lib/store";

/** The Discovery screen on its own, with the app's store and toasts. */
export async function renderDiscover(): Promise<void> {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <DiscoverScreen />
      </ToastProvider>
    </Provider>,
  );
}
