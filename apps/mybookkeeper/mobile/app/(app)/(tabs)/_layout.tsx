import { useTheme } from "@platform/mobile";
import { router, Tabs } from "expo-router";
import { newInquiryBadge, peopleTabLabel } from "../../../src/features/inquiries/newInquiryBadge";
import { useNewInquiryCount } from "../../../src/features/inquiries/useNewInquiryCount";
import { tabBarIcon } from "../../../src/features/shell/tabBarIcon";
import { useCanWrite } from "../../../src/features/workspace/useCanWrite";

export default function TabsLayout() {
  const { colors } = useTheme();
  const canWrite = useCanWrite();
  const newInquiries = useNewInquiryCount();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.foreground,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: tabBarIcon("home", "home-outline") }} />
      <Tabs.Screen name="money" options={{ title: "Money", tabBarIcon: tabBarIcon("wallet", "wallet-outline") }} />
      <Tabs.Screen
        listeners={{
          tabPress: (event) => {
            event.preventDefault();
            router.push("/camera");
          },
        }}
        name="capture"
        options={{
          title: "Capture",
          href: canWrite ? undefined : null,
          tabBarAccessibilityLabel: "Capture, opens the camera",
          tabBarIcon: tabBarIcon("camera"),
        }}
      />
      <Tabs.Screen
        name="people"
        options={{
          title: "People",
          tabBarAccessibilityLabel: peopleTabLabel(newInquiries),
          tabBarBadge: newInquiryBadge(newInquiries),
          tabBarIcon: tabBarIcon("people", "people-outline"),
        }}
      />
      <Tabs.Screen name="more" options={{ title: "More", tabBarIcon: tabBarIcon("ellipsis-horizontal") }} />
    </Tabs>
  );
}
