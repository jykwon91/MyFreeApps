import { Stack } from "expo-router";
import LeaseImportScreen from "../../../src/features/leaseImport/LeaseImportScreen";

export default function LeaseImportRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Import a lease", headerBackTitle: "Leases" }} />
      <LeaseImportScreen />
    </>
  );
}
