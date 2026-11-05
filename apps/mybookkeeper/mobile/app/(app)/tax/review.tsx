import { Stack } from "expo-router";
import TaxReviewScreen from "../../../src/features/tax/TaxReviewScreen";

export default function TaxReviewRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Tax Review", headerBackTitle: "More" }} />
      <TaxReviewScreen />
    </>
  );
}
