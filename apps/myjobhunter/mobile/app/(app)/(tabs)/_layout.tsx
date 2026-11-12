import { useTabScreenOptions } from "@platform/mobile";
import { Tabs } from "expo-router";
import { TABS } from "../../../src/constants/tabs";

export default function TabsLayout() {
  const screenOptions = useTabScreenOptions();
  return (
    <Tabs screenOptions={screenOptions}>
      {TABS.map((tab) => (
        <Tabs.Screen key={tab.name} name={tab.name} options={{ title: tab.title }} />
      ))}
    </Tabs>
  );
}
