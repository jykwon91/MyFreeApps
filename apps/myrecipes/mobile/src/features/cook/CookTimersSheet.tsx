import { useTheme } from "@platform/mobile";
import { ScrollView, Text, View } from "react-native";
import type { CookTimer } from "../../types/CookTimer";
import { formatTimerDuration } from "../../utils/formatCookTimer";
import CookSheet from "./CookSheet";
import CookTimerButton from "./CookTimerButton";

export default function CookTimersSheet({
  onClose,
  onRemove,
  timers,
}: {
  onClose: () => void;
  onRemove: (timerId: string) => void;
  timers: CookTimer[];
}) {
  const { colors, spacing, fontSize } = useTheme();

  return (
    <CookSheet onClose={onClose} testID="cook-timers-sheet" title="Timers">
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        {timers.map((timer) => (
          <View key={timer.id} style={{ gap: spacing.xs }}>
            <Text style={{ color: colors.foreground, fontSize: fontSize.md }}>
              Step {timer.stepNumber}, {formatTimerDuration(timer.seconds)}
            </Text>
            <CookTimerButton onRemove={onRemove} seconds={timer.seconds} timer={timer} />
          </View>
        ))}
      </ScrollView>
    </CookSheet>
  );
}
