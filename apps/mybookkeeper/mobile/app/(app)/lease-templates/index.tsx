import { Stack } from "expo-router";
import LeaseTemplatesScreen from "../../../src/features/leaseTemplates/LeaseTemplatesScreen";

export default function LeaseTemplatesRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Lease Templates", headerBackTitle: "More" }} />
      <LeaseTemplatesScreen />
    </>
  );
}
