import { Banner, LoadingButton, useTheme, useToast, WebLink } from "@platform/mobile";
import { ScrollView, Text, View } from "react-native";
import { useDispatch, useSelector } from "react-redux";
import { WEB_BASE_URL } from "../../constants/api";
import {
  AI_PERMISSION_ALLOWED_STATE,
  AI_PERMISSION_ALLOWED_TITLE,
  AI_PERMISSION_ASK_TITLE,
  AI_PERMISSION_LIMITS,
  AI_PERMISSION_NOT_ALLOWED_STATE,
  AI_PERMISSION_NOT_COVERED,
  AI_PERMISSION_WHAT_IS_SENT,
  PRIVACY_POLICY_PATH,
} from "../../constants/aiPermission";
import type { AppDispatch, RootState } from "../../lib/store";
import { drainUploadQueue } from "../capture/drainUploadQueue";
import { pendingUploads } from "../capture/uploadQueueFiles";
import { allowAi, stopAi } from "./aiPermission";
import { useHasAiPermission } from "./useHasAiPermission";
import { waitingFilesMessage } from "./waitingFilesMessage";

interface AiPermissionPanelProps {
  onAllowed?: () => void;
  onNotNow: () => void;
}

export default function AiPermissionPanel({ onAllowed, onNotNow }: AiPermissionPanelProps) {
  const { colors, fontSize, spacing } = useTheme();
  const { showToast } = useToast();
  const dispatch = useDispatch<AppDispatch>();
  const workspaceId = useSelector((state: RootState) => state.workspace.activeId);
  const isAllowed = useHasAiPermission();
  const waitingCount = workspaceId && !isAllowed ? pendingUploads(workspaceId).length : 0;

  function allow(): void {
    try {
      allowAi();
    } catch {
      showToast("I couldn't save that, so nothing was sent. Want to try again?", "error");
      return;
    }
    void dispatch(drainUploadQueue());
    onAllowed?.();
  }

  function stop(): void {
    try {
      stopAi();
      showToast("I've stopped sending new files.", "success");
    } catch {
      showToast("I couldn't change that, so it's still on. Want to try again?", "error");
    }
  }

  const paragraphs = [
    AI_PERMISSION_WHAT_IS_SENT,
    AI_PERMISSION_LIMITS,
    isAllowed ? AI_PERMISSION_ALLOWED_STATE : AI_PERMISSION_NOT_ALLOWED_STATE,
    AI_PERMISSION_NOT_COVERED,
  ];

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
        contentInsetAdjustmentBehavior="automatic"
        style={{ flex: 1 }}
      >
        <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: fontSize.xl, fontWeight: "700" }}>
          {isAllowed ? AI_PERMISSION_ALLOWED_TITLE : AI_PERMISSION_ASK_TITLE}
        </Text>
        {waitingCount > 0 ? <Banner message={waitingFilesMessage(waitingCount)} tone="success" /> : null}
        {paragraphs.map((paragraph) => (
          <Text key={paragraph} style={{ color: colors.foreground, fontSize: fontSize.md }}>
            {paragraph}
          </Text>
        ))}
        <WebLink label="Read the privacy policy" url={`${WEB_BASE_URL}${PRIVACY_POLICY_PATH}`} />
      </ScrollView>
      <View style={{ gap: spacing.sm, padding: spacing.lg }}>
        {isAllowed ? (
          <LoadingButton onPress={stop} variant="secondary">
            Stop sending
          </LoadingButton>
        ) : (
          <>
            <LoadingButton onPress={allow}>Allow</LoadingButton>
            <LoadingButton onPress={onNotNow} variant="secondary">
              Not now
            </LoadingButton>
          </>
        )}
      </View>
    </View>
  );
}
