import { useTheme } from "@platform/mobile";
import { View } from "react-native";

export default function RecipeListSeparator() {
  const { spacing } = useTheme();

  return <View style={{ height: spacing.md }} />;
}
