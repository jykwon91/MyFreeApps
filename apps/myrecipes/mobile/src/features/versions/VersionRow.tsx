import { VERSION_COPY } from "@myrecipes/api-client/constants/versions";
import { versionNote } from "@myrecipes/api-client/utils/versionNote";
import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, Text, View } from "react-native";
import { VERSION_HISTORY_MESSAGES as MESSAGES } from "../../constants/versions";
import type { VersionRowProps } from "../../types/VersionRowProps";
import { versionMeta } from "../../utils/versionMeta";
import { versionRowLabel } from "../../utils/versionRowLabel";
import CompareCheckbox from "./CompareCheckbox";

/**
 * One version in the history: its number, note, date, and the owner's cooks and best rating.
 * Tapping it shows what changed from the version it was based on, except for v1, which has none. While
 * picking two to compare, it's a checkbox instead.
 */
export default function VersionRow({ version, isLatest, isComparing, isPicked, isPickDisabled, onChoose }: VersionRowProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const note = versionNote(version);
  const isFirst = version.version_number === 1;
  const isPressable = isComparing || !isFirst;
  const muted = { color: colors.mutedForeground, fontSize: fontSize.xs };

  const body = (
    <>
      {isComparing ? <CompareCheckbox isChecked={isPicked} isDisabled={isPickDisabled} /> : null}
      <View style={{ flex: 1, gap: spacing.xs }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: spacing.sm }}>
          <Text style={{ color: colors.foreground, fontSize: fontSize.md, fontWeight: "600" }}>
            v{version.version_number}
          </Text>
          {isLatest ? <Text style={{ color: colors.primary, fontSize: fontSize.xs }}>{VERSION_COPY.latest}</Text> : null}
        </View>
        <Text
          numberOfLines={2}
          style={{
            color: colors.mutedForeground,
            fontSize: fontSize.sm,
            fontStyle: note.isPlaceholder ? "italic" : "normal",
          }}
        >
          {note.text}
        </Text>
        <Text style={muted}>{versionMeta(version).map((part) => part.text).join(" · ")}</Text>
      </View>
    </>
  );

  const frame = {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: spacing.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderRadius: radius.md,
    borderColor: isComparing && isPicked ? colors.primary : colors.border,
  };
  const label = versionRowLabel(version, isLatest);

  if (!isPressable) {
    return (
      <View accessibilityLabel={label} accessible style={{ ...frame, backgroundColor: colors.card }} testID={`version-${version.id}`}>
        {body}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityHint={isComparing ? (isPickDisabled ? undefined : MESSAGES.pickHint) : MESSAGES.openDiffHint}
      accessibilityLabel={label}
      accessibilityRole={isComparing ? "checkbox" : "button"}
      accessibilityState={isComparing ? { checked: isPicked, disabled: isPickDisabled } : undefined}
      disabled={isComparing && isPickDisabled}
      onPress={() => onChoose(version)}
      style={({ pressed }) => ({ ...frame, backgroundColor: pressed ? colors.muted : colors.card })}
      testID={`version-${version.id}`}
    >
      {body}
    </Pressable>
  );
}
