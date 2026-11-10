import { SessionProvider } from "@platform/mobile";
import { StatusBar } from "expo-status-bar";
import { Provider } from "react-redux";
import RootStack from "../src/features/account/RootStack";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";

export default function RootLayout() {
  return (
    <Provider store={store}>
      <SessionProvider session={session}>
        <StatusBar style="auto" />
        <RootStack />
      </SessionProvider>
    </Provider>
  );
}
