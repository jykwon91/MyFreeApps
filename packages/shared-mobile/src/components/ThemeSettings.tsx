import { Text } from "react-native";
import { SEGMENT_ROLE } from "../constants/segmentRole";
import { THEME_MESSAGES, THEME_OPTIONS } from "../constants/themePreference";
import { useThemePreference } from "../hooks/useThemePreference";
import { useTheme } from "../theme/useTheme";
import SegmentedControl from "./SegmentedControl";
import SettingsCard from "./SettingsCard";

/** Light, dark, or the phone's setting: the website's theme toggle, as a settings section. */
export default function ThemeSettings() {
  const { colors, fontSize } = useTheme();
  const { preference, setPreference } = useThemePreference();
  return (
    <SettingsCard>
      <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: fontSize.lg, fontWeight: "600" }}>
        {THEME_MESSAGES.heading}
      </Text>
      <SegmentedControl
        accessibilityLabel={THEME_MESSAGES.heading}
        onChange={setPreference}
        role={SEGMENT_ROLE.radio}
        segments={THEME_OPTIONS}
        value={preference}
      />
    </SettingsCard>
  );
}
