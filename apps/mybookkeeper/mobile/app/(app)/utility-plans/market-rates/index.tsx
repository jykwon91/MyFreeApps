import { Stack } from "expo-router";
import MarketRatesScreen from "../../../../src/features/utilityPlans/MarketRatesScreen";

export default function MarketRatesRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Market rates", headerBackTitle: "Utility Plans" }} />
      <MarketRatesScreen />
    </>
  );
}
