import { Stack } from "expo-router";
import BankImportScreen from "../../../src/features/bankImport/BankImportScreen";

export default function BankImportRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Import a statement", headerBackTitle: "Transactions" }} />
      <BankImportScreen />
    </>
  );
}
