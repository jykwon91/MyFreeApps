import { ToastProvider } from "@platform/mobile";
import { render } from "@testing-library/react-native";
import { Provider } from "react-redux";
import CompanyDetailScreen from "../src/features/companyDetail/CompanyDetailScreen";
import { store } from "../src/lib/store";

/** The company screen as its route shows it, with the app's store and toasts. */
export async function renderCompanyDetail(id: string): Promise<void> {
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <CompanyDetailScreen id={id} />
      </ToastProvider>
    </Provider>,
  );
}
