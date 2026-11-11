import { daysInStage } from "@myjobhunter/api-client/utils/daysInStage";
import { formatDaysInStage } from "@myjobhunter/api-client/utils/formatDaysInStage";
import { formatVerdict } from "@myjobhunter/api-client/utils/formatVerdict";
import { stageAgeTone } from "@myjobhunter/api-client/utils/stageAgeTone";
import { toneForVerdict } from "@myjobhunter/api-client/utils/toneForVerdict";
import { Chip, LoadingButton, MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, Text, View } from "react-native";
import { APPLICATION_DETAIL_MESSAGES } from "../../constants/applicationDetail";
import { DASHBOARD_MESSAGES as MESSAGES } from "../../constants/dashboard";
import { boardCardLabel, moveButtonLabel } from "../../lib/boardCardDisplay";
import type { BoardCardProps } from "../../types/BoardCardProps";
import CompanyLogo from "./CompanyLogo";

/** One application on the board: tap it to open, or Move it to another stage. */
export default function BoardCard({ item, now, isMoving, onOpen, onMove }: BoardCardProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const verdict = formatVerdict(item.verdict);
  const stageDays = daysInStage(item.stage_entered_at, now);
  const ageTone = stageAgeTone(stageDays);
  // The badge shows only once a card has sat a week, so the label says so only then too.
  const shownDays = ageTone === null ? null : stageDays;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.sm,
        marginHorizontal: spacing.lg,
        marginBottom: spacing.sm,
        paddingRight: spacing.sm,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.md,
        backgroundColor: colors.card,
      }}
    >
      <Pressable
        accessibilityHint={MESSAGES.opensApplication}
        accessibilityLabel={boardCardLabel(item, shownDays)}
        accessibilityRole="link"
        onPress={onOpen}
        style={({ pressed }) => ({
          flex: 1,
          flexDirection: "row",
          gap: spacing.sm,
          minHeight: MIN_TOUCH_TARGET,
          padding: spacing.md,
          borderRadius: radius.md,
          backgroundColor: pressed ? colors.muted : "transparent",
        })}
      >
        <CompanyLogo url={item.company_logo_url} />
        <View style={{ flex: 1, gap: spacing.xs }}>
          <Text numberOfLines={2} style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
            {item.role_title}
          </Text>
          <Text numberOfLines={1} style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
            {item.company_name}
          </Text>
          {verdict || shownDays !== null ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, paddingTop: spacing.xs }}>
              {verdict ? <Chip label={verdict} tone={toneForVerdict(item.verdict)} /> : null}
              {shownDays !== null && ageTone !== null ? <Chip label={formatDaysInStage(shownDays)} tone={ageTone} /> : null}
            </View>
          ) : null}
        </View>
      </Pressable>
      <LoadingButton
        accessibilityHint={MESSAGES.moveHint}
        accessibilityLabel={moveButtonLabel(item)}
        isLoading={isMoving}
        loadingText={APPLICATION_DETAIL_MESSAGES.moving}
        onPress={onMove}
        variant="secondary"
      >
        {MESSAGES.move}
      </LoadingButton>
    </View>
  );
}
