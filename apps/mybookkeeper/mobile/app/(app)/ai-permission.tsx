import { Stack, router } from "expo-router";
import AiPermissionPanel from "../../src/features/aiPermission/AiPermissionPanel";

export default function AiPermissionRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Claude and my documents", headerBackTitle: "Back" }} />
      <AiPermissionPanel onAllowed={() => router.back()} onNotNow={() => router.back()} />
    </>
  );
}
