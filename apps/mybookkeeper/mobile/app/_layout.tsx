import { clearDataExportFiles, RootProviders } from "@platform/mobile";
import { StatusBar } from "expo-status-bar";
import { Provider } from "react-redux";
import RootStack from "../src/features/account/RootStack";
import { clearDocumentFiles } from "../src/features/documents/openDocumentFile";
import { clearHeldFiles } from "../src/features/uploads/heldFile";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { useEffect } from "react";

export default function RootLayout() {
  useEffect(() => {
    clearHeldFiles();
    clearDocumentFiles();
    clearDataExportFiles();
  }, []);

  return (
    <Provider store={store}>
      <RootProviders session={session}>
        <StatusBar style="auto" />
        <RootStack />
      </RootProviders>
    </Provider>
  );
}
