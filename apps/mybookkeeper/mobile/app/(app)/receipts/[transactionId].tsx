import { Stack, useLocalSearchParams } from "expo-router";
import SendReceiptScreen from "../../../src/features/receipts/SendReceiptScreen";
import ValidRoute from "../../../src/features/routing/ValidRoute";

export default function SendReceiptRoute() {
  const { transactionId } = useLocalSearchParams<{ transactionId: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Send receipt", headerBackTitle: "Receipts" }} />
      <ValidRoute uuids={["transactionId"]}>
        <SendReceiptScreen transactionId={transactionId} />
      </ValidRoute>
    </>
  );
}
