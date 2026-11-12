import { clearDataExportFiles, SessionProvider } from "@platform/mobile";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Provider } from "react-redux";
import RootStack from "../src/features/account/RootStack";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";

export default function RootLayout() {
  // A copy left behind if the app was killed while the share sheet had it.
  useEffect(() => {
    clearDataExportFiles();
  }, []);

  return (
    <Provider store={store}>
      <SessionProvider session={session}>
        <StatusBar style="auto" />
        <RootStack />
      </SessionProvider>
    </Provider>
  );
}
