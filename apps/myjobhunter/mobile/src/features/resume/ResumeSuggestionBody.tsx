import { LoadingButton, MIN_TOUCH_TARGET, Skeleton, useTheme, useToneColor } from "@platform/mobile";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { RESUME_MESSAGES as MESSAGES } from "../../constants/resume";
import type { ResumeSuggestionBodyProps } from "../../types/ResumeSuggestionBodyProps";

/** The assistant's turn: a question to answer below, a rewrite being written, the rewrite, or the wait for one. */
export default function ResumeSuggestionBody({ clarifyingQuestion, proposal, rationale, isPending, isRegenerating, canForce, onForce, isForcing }: ResumeSuggestionBodyProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const question = useToneColor("warning");
  const rewrite = useToneColor("success");
  const [showRationale, setShowRationale] = useState(false);
  const boxStyle = { gap: spacing.xs, padding: spacing.md, borderRadius: radius.md, backgroundColor: rewrite?.background };
  const caption = <Text style={{ color: rewrite?.foreground, fontSize: fontSize.xs, fontWeight: "600" }}>{MESSAGES.proposed}</Text>;

  if (clarifyingQuestion) {
    return (
      <View style={{ gap: spacing.sm }}>
        <View style={{ padding: spacing.md, borderRadius: radius.md, backgroundColor: question?.background }}>
          <Text style={{ color: question?.foreground, fontSize: fontSize.sm }}>{clarifyingQuestion}</Text>
        </View>
        {canForce ? (
          <View style={{ gap: spacing.sm }}>
            <Text style={{ color: colors.mutedForeground, fontSize: fontSize.xs }}>{MESSAGES.forcePrompt}</Text>
            <LoadingButton disabled={isPending && !isForcing} isLoading={isForcing} onPress={onForce} variant="secondary">
              {MESSAGES.force}
            </LoadingButton>
          </View>
        ) : null}
        {/* A wrong fact is fixed on Profile, not here. The session stays where it is. */}
        <Text style={{ color: colors.mutedForeground, fontSize: fontSize.xs }}>{MESSAGES.factHint}</Text>
        <LoadingButton onPress={() => router.push("/profile")} variant="ghost">
          {MESSAGES.openProfile}
        </LoadingButton>
      </View>
    );
  }

  if (isRegenerating) {
    return (
      <View style={boxStyle} testID="resume-regenerating">
        {caption}
        <Skeleton height={14} width="80%" />
        <Skeleton height={14} width="60%" />
      </View>
    );
  }

  if (proposal) {
    return (
      <View style={boxStyle}>
        {caption}
        <Text selectable style={{ color: colors.foreground, fontSize: fontSize.sm }}>
          {proposal}
        </Text>
        {rationale ? (
          <>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: showRationale }}
              onPress={() => setShowRationale((shown) => !shown)}
              style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: "center", alignSelf: "flex-start" }}
            >
              <Text style={{ color: colors.primary, fontSize: fontSize.xs, fontWeight: "500" }}>{showRationale ? MESSAGES.hideWhy : MESSAGES.why}</Text>
            </Pressable>
            {showRationale ? <Text style={{ color: colors.mutedForeground, fontSize: fontSize.xs, fontStyle: "italic" }}>{rationale}</Text> : null}
          </>
        ) : null}
      </View>
    );
  }

  return <Text style={{ color: colors.mutedForeground, fontSize: fontSize.sm }}>{MESSAGES.thinking}</Text>;
}
