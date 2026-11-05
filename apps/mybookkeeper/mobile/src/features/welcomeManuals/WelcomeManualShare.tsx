import { LoadingButton, useTheme, useToast } from "@platform/mobile";
import { Share, Text, View } from "react-native";
import { WELCOME_MANUAL_MESSAGES } from "../../constants/welcomeManuals";
import HiddenNumber from "../shell/HiddenNumber";
import { manualShareMessage } from "./welcomeManualDisplay";

interface WelcomeManualShareProps {
  token: string | null;
  pin: string | null;
}

export default function WelcomeManualShare({ token, pin }: WelcomeManualShareProps) {
  const { colors, spacing, fontSize } = useTheme();
  const { showToast } = useToast();

  if (!token) {
    return <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{WELCOME_MANUAL_MESSAGES.noShareLink}</Text>;
  }

  async function share(linkToken: string): Promise<void> {
    try {
      await Share.share({ message: manualShareMessage(linkToken, pin) });
    } catch {
      showToast(WELCOME_MANUAL_MESSAGES.shareFailed, "error");
    }
  }

  return (
    <View style={{ gap: spacing.sm }}>
      {pin ? <HiddenNumber label={WELCOME_MANUAL_MESSAGES.accessCode} value={pin} /> : null}
      <LoadingButton onPress={() => void share(token)} variant="secondary">
        {pin ? WELCOME_MANUAL_MESSAGES.share : WELCOME_MANUAL_MESSAGES.shareLinkOnly}
      </LoadingButton>
    </View>
  );
}
