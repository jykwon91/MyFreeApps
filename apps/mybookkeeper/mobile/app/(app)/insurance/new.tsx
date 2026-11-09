import { Stack } from "expo-router";
import NewPolicyScreen from "../../../src/features/insurance/NewPolicyScreen";

export default function NewPolicyRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "New policy", headerBackTitle: "Insurance" }} />
      <NewPolicyScreen />
    </>
  );
}
