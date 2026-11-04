import { Stack } from "expo-router";
import LeasesScreen from "../../../src/features/leases/LeasesScreen";

export default function LeasesRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Leases", headerBackTitle: "More" }} />
      <LeasesScreen />
    </>
  );
}
