import { Stack } from "expo-router";
import MortgagesScreen from "../../../src/features/mortgages/MortgagesScreen";

export default function MortgagesRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Mortgages", headerBackTitle: "More" }} />
      <MortgagesScreen />
    </>
  );
}
