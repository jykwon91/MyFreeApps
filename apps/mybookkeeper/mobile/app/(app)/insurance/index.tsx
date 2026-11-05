import { Stack } from "expo-router";
import PoliciesScreen from "../../../src/features/insurance/PoliciesScreen";

export default function InsuranceRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Insurance", headerBackTitle: "More" }} />
      <PoliciesScreen />
    </>
  );
}
