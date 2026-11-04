import { useTheme } from "@platform/mobile";
import { router, Tabs } from "expo-router";
import { useCanWrite } from "../../../src/features/workspace/useCanWrite";

export default function TabsLayout() {
  const { colors } = useTheme();
  const canWrite = useCanWrite();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.foreground,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarIconStyle: { display: "none" },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="money" options={{ title: "Money" }} />
      <Tabs.Screen
        listeners={{
          tabPress: (event) => {
            event.preventDefault();
            router.push("/camera");
          },
        }}
        name="capture"
        options={{ title: "Capture", href: canWrite ? undefined : null }}
      />
      <Tabs.Screen name="people" options={{ title: "People" }} />
      <Tabs.Screen name="more" options={{ title: "More" }} />
    </Tabs>
  );
}
