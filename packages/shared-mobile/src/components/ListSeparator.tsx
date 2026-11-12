import { View } from "react-native";
import { useTheme } from "../theme/useTheme";

/** The gap between cards in a list, as `ItemSeparatorComponent`. */
export default function ListSeparator() {
  const { spacing } = useTheme();
  return <View style={{ height: spacing.md }} testID="list-separator" />;
}
