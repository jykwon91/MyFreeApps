import Constants from "expo-constants";
import { Text, View } from "react-native";
import { useTheme } from "../theme/useTheme";
import type { AppVersionProps } from "../types/AppVersionProps";
import LoadingRegion from "./LoadingRegion";
import Skeleton from "./Skeleton";

const SERVER_PLACEHOLDER_WIDTH = 96;

/** The version this phone is running, plus the server build when given, for telling support. */
export default function AppVersion({ serverCommit, isServerLoading = false }: AppVersionProps) {
  const { colors, fontSize, spacing } = useTheme();
  const version = Constants.expoConfig?.version;
  const textStyle = { color: colors.mutedForeground, fontSize: fontSize.xs };
  if (!version && !serverCommit && !isServerLoading) return null;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
      {version ? <Text style={textStyle}>Version {version}</Text> : null}
      {isServerLoading ? (
        <LoadingRegion>
          <Skeleton height={fontSize.xs} testID="server-version-skeleton" width={SERVER_PLACEHOLDER_WIDTH} />
        </LoadingRegion>
      ) : null}
      {serverCommit ? <Text selectable style={textStyle}>Server v.{serverCommit}</Text> : null}
    </View>
  );
}
