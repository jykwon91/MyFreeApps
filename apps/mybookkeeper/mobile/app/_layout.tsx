import { SessionProvider } from "@platform/mobile";
import { StatusBar } from "expo-status-bar";
import { Provider } from "react-redux";
import RootStack from "../src/features/account/RootStack";
import { clearHeldFiles } from "../src/features/uploads/heldFile";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { useEffect } from "react";

export default function RootLayout() {
  useEffect(() => {
    clearHeldFiles();
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
