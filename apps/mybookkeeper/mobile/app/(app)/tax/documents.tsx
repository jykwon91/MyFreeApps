import { Stack } from "expo-router";
import TaxDocumentsScreen from "../../../src/features/tax/TaxDocumentsScreen";

export default function TaxDocumentsRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Tax Documents", headerBackTitle: "More" }} />
      <TaxDocumentsScreen />
    </>
  );
}
