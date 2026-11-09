import { Stack } from "expo-router";
import UtilityRenewalsScreen from "../../../src/features/utilityPlans/UtilityRenewalsScreen";

export default function UtilityRenewalsRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Renewals", headerBackTitle: "Utility Plans" }} />
      <UtilityRenewalsScreen />
    </>
  );
}
