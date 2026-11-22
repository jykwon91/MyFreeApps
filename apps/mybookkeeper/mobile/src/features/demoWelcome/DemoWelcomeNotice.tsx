import {
  DEMO_WELCOME_DESCRIPTION,
  DEMO_WELCOME_DISMISS,
  DEMO_WELCOME_EDIT,
  DEMO_WELCOME_FEATURES,
  DEMO_WELCOME_TITLE,
  DEMO_WELCOME_UPLOAD,
} from "@mybookkeeper/api-client/constants/demoWelcome";
import { LoadingButton, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import HomeCard from "../home/HomeCard";
import { useActiveWorkspace } from "../workspace/useActiveWorkspace";
import { dismissDemoWelcome } from "./demoWelcome";
import { useDemoWelcomeDismissed } from "./useDemoWelcomeDismissed";

/** The website's sandbox welcome, as a card on Home that goes away for good once dismissed. */
export default function DemoWelcomeNotice() {
  const { colors, spacing, fontSize } = useTheme();
  const workspace = useActiveWorkspace();
  const dismissed = useDemoWelcomeDismissed();
  if (!workspace?.is_demo || dismissed) return null;

  return (
    <HomeCard testID="demo-welcome-notice" title={DEMO_WELCOME_TITLE}>
      <View style={{ gap: spacing.sm }}>
        {[DEMO_WELCOME_DESCRIPTION, DEMO_WELCOME_UPLOAD, DEMO_WELCOME_FEATURES, DEMO_WELCOME_EDIT].map((line) => (
          <Text key={line} style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
            {line}
          </Text>
        ))}
      </View>
      <LoadingButton onPress={dismissDemoWelcome}>{DEMO_WELCOME_DISMISS}</LoadingButton>
    </HomeCard>
  );
}
