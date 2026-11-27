import { Text } from "react-native";
import { AUTH_FORM_COPY } from "../constants/authForms";
import { useAnnouncement } from "../hooks/useAnnouncement";
import { useTheme } from "../theme/useTheme";
import type { EmailSentNoticeProps } from "../types/EmailSentNoticeProps";
import AuthScreenHeading from "./AuthScreenHeading";
import LoadingButton from "./LoadingButton";

/** "Check your inbox", after sign-up or a reset request, with the way back to sign-in. */
export default function EmailSentNotice({ appName, message, note, onSignIn }: EmailSentNoticeProps) {
  const { colors, fontSize } = useTheme();
  // The form it replaces had focus, so say what happened.
  useAnnouncement(message, "polite");
  return (
    <>
      <AuthScreenHeading appName={appName} title={AUTH_FORM_COPY.sentTitle} />
      <Text style={{ color: colors.foreground, fontSize: fontSize.md }}>{message}</Text>
      {note ? <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>{note}</Text> : null}
      <LoadingButton onPress={onSignIn}>{AUTH_FORM_COPY.backToSignIn}</LoadingButton>
    </>
  );
}
