import { useTabScreenOptions } from "@platform/mobile";
import { Tabs } from "expo-router";
import RecipesHeaderActions from "../../src/features/recipes/RecipesHeaderActions";

export default function TabsLayout() {
  const screenOptions = useTabScreenOptions();

  return (
    <Tabs screenOptions={screenOptions}>
      <Tabs.Screen name="index" options={{ title: "Recipes", headerRight: () => <RecipesHeaderActions /> }} />
      <Tabs.Screen name="discover" options={{ title: "Discover" }} />
      <Tabs.Screen name="settings" options={{ title: "Settings" }} />
    </Tabs>
  );
}
