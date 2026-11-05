import { Stack } from "expo-router";
import TaxReturnsScreen from "../../../src/features/taxReturns/TaxReturnsScreen";

export default function TaxReturnsRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Tax Returns", headerBackTitle: "More" }} />
      <TaxReturnsScreen />
    </>
  );
}
