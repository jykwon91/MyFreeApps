import { ToastProvider } from "@platform/mobile";
import { render } from "@testing-library/react-native";
import { Provider } from "react-redux";
import ProfileScreen from "../src/features/profile/ProfileScreen";
import { store } from "../src/lib/store";

/** The Profile tab as its route shows it, with the app's store and toasts. */
export async function renderProfile(): Promise<void> {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <ProfileScreen />
      </ToastProvider>
    </Provider>,
  );
}
