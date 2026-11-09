import { Stack } from "expo-router";
import TaxReturnCreateScreen from "../../../src/features/taxReturns/TaxReturnCreateScreen";

export default function TaxReturnNewRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "New tax return", headerBackTitle: "Tax Returns" }} />
      <TaxReturnCreateScreen />
    </>
  );
}
