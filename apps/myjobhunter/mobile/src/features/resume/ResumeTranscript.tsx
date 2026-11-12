import { isUserRefinementRole } from "@myjobhunter/api-client/utils/isUserRefinementRole";
import { conversationItems } from "@myjobhunter/api-client/utils/conversationItems";
import { refinementTurnBody } from "@myjobhunter/api-client/utils/refinementTurnBody";
import { timeAgo } from "@platform/core/utils/timeAgo";
import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { RESUME_MESSAGES as MESSAGES } from "../../constants/resume";
import type { ResumeTranscriptProps } from "../../types/ResumeTranscriptProps";
import ResumeTurnBubble from "./ResumeTurnBubble";

/** The session's conversation, oldest first, grouped by section, with a message just sent shown at once. */
export default function ResumeTranscript({ turns, pendingEcho }: ResumeTranscriptProps) {
  const { colors, spacing, fontSize } = useTheme();
  const items = conversationItems(turns);
  if (items.length === 0 && !pendingEcho) return null;

  return (
    <View style={{ gap: spacing.sm }} testID="resume-transcript">
      <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: fontSize.md, fontWeight: "600" }}>
        {MESSAGES.transcriptHeading}
      </Text>
      {items.map((item, index) =>
        item.kind === "divider" ? (
          <Text
            accessibilityRole="header"
            key={`divider-${index}`}
            style={{ color: colors.mutedForeground, fontSize: fontSize.xs, fontWeight: "600", textAlign: "center", textTransform: "uppercase", paddingTop: spacing.xs }}
          >
            {item.section}
          </Text>
        ) : (
          <ResumeTurnBubble body={refinementTurnBody(item.turn) ?? ""} caption={timeAgo(item.turn.created_at)} isUser={isUserRefinementRole(item.turn.role)} key={item.turn.id} />
        ),
      )}
      {pendingEcho ? (
        <>
          <ResumeTurnBubble body={pendingEcho} caption={MESSAGES.sending} isUser />
          <ResumeTurnBubble body={MESSAGES.thinking} isUser={false} />
        </>
      ) : null}
    </View>
  );
}
