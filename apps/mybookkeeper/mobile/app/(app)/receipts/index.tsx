import { Stack } from "expo-router";
import ReceiptsScreen from "../../../src/features/receipts/ReceiptsScreen";

export default function ReceiptsRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Rent Receipts", headerBackTitle: "More" }} />
      <ReceiptsScreen />
    </>
  );
}
