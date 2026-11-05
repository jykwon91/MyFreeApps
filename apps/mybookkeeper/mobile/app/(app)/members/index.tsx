import { Stack } from "expo-router";
import MembersScreen from "../../../src/features/members/MembersScreen";
import { useActiveWorkspace } from "../../../src/features/workspace/useActiveWorkspace";

export default function MembersRoute() {
  const workspace = useActiveWorkspace();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "Members", headerBackTitle: "More" }} />
      {workspace ? <MembersScreen workspace={workspace} /> : null}
    </>
  );
}
