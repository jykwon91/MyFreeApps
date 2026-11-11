import { Stack } from "expo-router";
import { DOCUMENTS_SCREEN_MESSAGES as MESSAGES } from "../../src/constants/documentsScreen";
import DocumentsScreen from "../../src/features/documents/DocumentsScreen";

export default function DocumentsRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: MESSAGES.screenTitle, headerBackTitle: MESSAGES.backTitle }} />
      <DocumentsScreen />
    </>
  );
}
