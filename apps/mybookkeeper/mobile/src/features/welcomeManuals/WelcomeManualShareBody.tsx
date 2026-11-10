import { Banner, LoadingButton, useTheme, useToast } from "@platform/mobile";
import { useRef } from "react";
import { ScrollView, Share, Text, View } from "react-native";
import { WELCOME_MANUAL_SHARE_MESSAGES as MESSAGES } from "../../constants/welcomeManualForms";
import { askOnce } from "../../lib/askOnce";
import { copyText } from "../../lib/copyText";
import type { WelcomeManualView } from "../../types/WelcomeManualView";
import HiddenNumber from "../shell/HiddenNumber";
import { useCanWrite } from "../workspace/useCanWrite";
import { manualShareLink, manualShareMessage } from "./welcomeManualDisplay";
import { useWelcomeManualShare } from "./useWelcomeManualShare";

/** The share link and access code of a manual, with the ways to hand them to a guest. */
export default function WelcomeManualShareBody({ manual, refreshControl }: WelcomeManualView) {
  const { colors, spacing, fontSize } = useTheme();
  const { showToast } = useToast();
  const canWrite = useCanWrite();
  const share = useWelcomeManualShare(manual.id);
  const asking = useRef(false);
  const token = manual.share_token;
  const pin = manual.share_pin;

  async function copy(text: string, done: string): Promise<void> {
    const copied = await copyText(text);
    showToast(copied ? done : MESSAGES.copyFailed, copied ? undefined : "error");
  }

  async function send(linkToken: string): Promise<void> {
    try {
      await Share.share({ message: manualShareMessage(linkToken, pin) });
    } catch {
      showToast(MESSAGES.shareFailed, "error");
    }
  }

  return (
    <ScrollView contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }} contentInsetAdjustmentBehavior="automatic" refreshControl={refreshControl}>
      {share.failure ? <Banner message={share.failure} /> : null}
      {token ? (
        <>
          <View style={{ gap: spacing.xs }}>
            <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.link}</Text>
            <Text selectable style={{ fontSize: fontSize.md, color: colors.foreground }}>{manualShareLink(token)}</Text>
          </View>
          {pin ? <HiddenNumber label={MESSAGES.code} value={pin} /> : null}
          <View style={{ gap: spacing.sm }}>
            <LoadingButton onPress={() => void send(token)}>{MESSAGES.send}</LoadingButton>
            <LoadingButton onPress={() => void copy(manualShareLink(token), MESSAGES.copiedLink)} variant="secondary">{MESSAGES.copyLink}</LoadingButton>
            {pin ? <LoadingButton onPress={() => void copy(pin, MESSAGES.copiedCode)} variant="secondary">{MESSAGES.copyCode}</LoadingButton> : null}
          </View>
          {canWrite ? (
            <View style={{ gap: spacing.sm }}>
              <LoadingButton
                disabled={share.isBusy}
                isLoading={share.doing === "make a new code"}
                loadingText={MESSAGES.working}
                onPress={() => askOnce(asking, MESSAGES.newCodeTitle, MESSAGES.newCodeBody, { text: MESSAGES.newCodeConfirm, onPress: () => void share.newCode() })}
                variant="secondary"
              >
                {MESSAGES.newCode}
              </LoadingButton>
              <LoadingButton
                disabled={share.isBusy}
                isLoading={share.doing === "stop sharing"}
                loadingText={MESSAGES.working}
                onPress={() => askOnce(asking, MESSAGES.revokeTitle, MESSAGES.revokeBody, { text: MESSAGES.revokeConfirm, style: "destructive", onPress: () => void share.revoke() })}
                variant="destructive"
              >
                {MESSAGES.revoke}
              </LoadingButton>
            </View>
          ) : null}
        </>
      ) : (
        <View style={{ gap: spacing.sm }}>
          <Text style={{ fontSize: fontSize.lg, fontWeight: "600", color: colors.foreground }}>{MESSAGES.off}</Text>
          <Text style={{ fontSize: fontSize.md, color: colors.mutedForeground }}>{MESSAGES.offBody}</Text>
          {canWrite ? (
            <LoadingButton isLoading={share.isBusy} loadingText={MESSAGES.enabling} onPress={() => void share.enable()}>
              {MESSAGES.enable}
            </LoadingButton>
          ) : null}
        </View>
      )}
    </ScrollView>
  );
}
