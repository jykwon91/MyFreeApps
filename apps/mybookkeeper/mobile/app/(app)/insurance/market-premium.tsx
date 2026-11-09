import { Stack } from "expo-router";
import MarketPremiumScreen from "../../../src/features/insurance/MarketPremiumScreen";

export default function MarketPremiumRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Market premium", headerBackTitle: "Insurance" }} />
      <MarketPremiumScreen />
    </>
  );
}
