import { Banner, useTheme } from "@platform/mobile";
import { useEffect } from "react";
import { Text, View } from "react-native";
import { useDispatch, useSelector } from "react-redux";
import { SENT_MESSAGE_MS } from "../../constants/capture";
import type { AppDispatch, RootState } from "../../lib/store";
import { drainUploadQueue } from "./drainUploadQueue";
import { uploadPhaseChanged, uploadStatusDismissed } from "./uploadsSlice";

/** Where the photos are. Nothing here needs an answer unless a send failed. */
export default function UploadStatus() {
  const { colors, spacing, fontSize } = useTheme();
  const dispatch = useDispatch<AppDispatch>();
  const { phase, rejections } = useSelector((state: RootState) => state.uploads);

  useEffect(() => {
    if (phase !== "sent") return;
    const timer = setTimeout(() => dispatch(uploadPhaseChanged("idle")), SENT_MESSAGE_MS);
    return () => clearTimeout(timer);
  }, [dispatch, phase]);

  const dismiss = { label: "OK", onPress: () => dispatch(uploadStatusDismissed()) };

  return (
    <View style={{ gap: spacing.sm }}>
      {rejections.length > 0 ? <Banner actions={[dismiss]} message={rejections.join("\n")} /> : null}
      {phase === "unreachable" ? (
        <Banner
          actions={[{ label: "Try again", onPress: () => void dispatch(drainUploadQueue()) }]}
          message="I couldn't send that. It's saved here, and I'll try again when you come back. Want me to try now?"
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
