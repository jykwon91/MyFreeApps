import { Stack } from "expo-router";
import MortgageFormScreen from "../../../src/features/mortgages/MortgageFormScreen";

export default function MortgageNewRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Add mortgage", headerBackTitle: "Mortgages" }} />
      <MortgageFormScreen />
    </>
  );
}
