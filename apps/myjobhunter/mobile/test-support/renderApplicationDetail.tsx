import { ToastProvider } from "@platform/mobile";
import { render } from "@testing-library/react-native";
import { Provider } from "react-redux";
import ApplicationDetailScreen from "../src/features/applicationDetail/ApplicationDetailScreen";
import { store } from "../src/lib/store";

/** The application screen as its route shows it, with the app's store and toasts. */
export async function renderApplicationDetail(id: string): Promise<void> {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <ApplicationDetailScreen id={id} />
      </ToastProvider>
    </Provider>,
  );
}
