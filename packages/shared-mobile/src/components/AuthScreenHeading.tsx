import { Text } from "react-native";
import { useTheme } from "../theme/useTheme";
import type { AuthScreenHeadingProps } from "../types/AuthScreenHeadingProps";

/** The app's name over the screen's title, as sign-in, sign-up and the password reset start. */
export default function AuthScreenHeading({ appName, title }: AuthScreenHeadingProps) {
  const { colors, fontSize } = useTheme();
  return (
    <>
      <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>{appName}</Text>
      <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: fontSize.xl, fontWeight: "700" }}>
        {title}
      </Text>
    </>
  );
}
