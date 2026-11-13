import { Banner, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useEffect } from "react";
import { Text, View } from "react-native";
import { useDispatch, useSelector } from "react-redux";
import { SENT_MESSAGE_MS } from "../../constants/capture";
import type { AppDispatch, RootState } from "../../lib/store";
import { waitingFilesMessage } from "../aiPermission/waitingFilesMessage";
import { drainUploadQueue } from "./drainUploadQueue";
import { pendingUploads } from "./uploadQueueFiles";
import UploadFileRow from "./UploadFileRow";
import { uploadSentSettled, uploadStatusDismissed } from "./uploadsSlice";

/** Where each file is. Nothing here needs an answer unless a send failed. */
export default function UploadStatus() {
  const { colors, spacing, fontSize } = useTheme();
  const dispatch = useDispatch<AppDispatch>();
  const { phase, rejections, files } = useSelector((state: RootState) => state.uploads);
  const workspaceId = useSelector((state: RootState) => state.workspace.activeId);

  useEffect(() => {
    if (phase !== "sent") return;
    const timer = setTimeout(() => dispatch(uploadSentSettled()), SENT_MESSAGE_MS);
    return () => clearTimeout(timer);
  }, [dispatch, phase]);

  const dismiss = { label: "OK", onPress: () => dispatch(uploadStatusDismissed()) };

  return (
    <View style={{ gap: spacing.sm }}>
      {files.map((file) => (
        <UploadFileRow file={file} key={file.uri} />
      ))}
      {rejections.length > 0 ? <Banner actions={[dismiss]} message={rejections.join("\n")} /> : null}
      {phase === "unreachable" ? (
        <Banner
          actions={[{ label: "Try again", onPress: () => void dispatch(drainUploadQueue()) }]}
          message="I couldn't send that. It's saved here, and I'll try again when you come back. Want me to try now?"
        />
      ) : null}
      {phase === "waitingForPermission" && workspaceId ? (
        <Banner
          actions={[{ label: "Review", onPress: () => router.push("/ai-permission") }]}
          message={waitingFilesMessage(pendingUploads(workspaceId).length)}
          tone="success"
        />
      ) : null}
      {phase === "limitReached" ? (
        <Banner actions={[dismiss]} message="You've hit today's upload limit. Your photos are saved here, and I'll send them when you come back tomorrow." />
      ) : null}
      {phase === "sending" || phase === "sent" ? (
        <Text accessibilityLiveRegion="polite" style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
          {phase === "sending" ? "Sending…" : "Got it. I'm reading it now."}
        </Text>
      ) : null}
    </View>
  );
}
