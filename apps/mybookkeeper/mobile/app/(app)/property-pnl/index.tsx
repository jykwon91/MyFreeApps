import { Stack } from "expo-router";
import PropertyPnlScreen from "../../../src/features/propertyPnl/PropertyPnlScreen";

export default function PropertyPnlRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Property P&L", headerBackTitle: "More" }} />
      <PropertyPnlScreen />
    </>
  );
}
