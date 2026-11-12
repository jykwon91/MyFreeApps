import { SessionProvider } from "@platform/mobile";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Provider } from "react-redux";
import RootStack from "../src/features/account/RootStack";
import { clearDataExportFiles } from "../src/lib/dataExportFiles";
import { clearResumeExportFiles } from "../src/lib/resumeExportFiles";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";

export default function RootLayout() {
  useEffect(() => {
    clearDataExportFiles();
    clearResumeExportFiles();
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
