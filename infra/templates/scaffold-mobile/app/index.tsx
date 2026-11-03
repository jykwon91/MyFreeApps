import { EmptyState } from "@platform/mobile";
import { View } from "react-native";

export default function Home() {
  return (
    <View style={{ flex: 1, justifyContent: "center" }}>
      <EmptyState body="This screen is a placeholder." heading={"__APP_DISPLAY_NAME__"} />
    </View>
  );
}
