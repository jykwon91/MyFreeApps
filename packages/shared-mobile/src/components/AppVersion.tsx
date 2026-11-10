import Constants from "expo-constants";
import { Text } from "react-native";
import { useTheme } from "../theme/useTheme";

/** The version this phone is running, for telling support. */
export default function AppVersion() {
  const { colors, fontSize } = useTheme();
  const version = Constants.expoConfig?.version;
  return version ? <Text style={{ color: colors.mutedForeground, fontSize: fontSize.xs }}>Version {version}</Text> : null;
}
