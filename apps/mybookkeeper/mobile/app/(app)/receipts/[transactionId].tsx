import { Stack, useLocalSearchParams } from "expo-router";
import SendReceiptScreen from "../../../src/features/receipts/SendReceiptScreen";

export default function SendReceiptRoute() {
  const { transactionId } = useLocalSearchParams<{ transactionId: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Send receipt", headerBackTitle: "Receipts" }} />
      <SendReceiptScreen transactionId={transactionId} />
    </>
  );
}
