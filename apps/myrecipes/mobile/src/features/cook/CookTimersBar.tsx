import { useTheme } from "@platform/mobile";
import { View } from "react-native";
import type { CookTimer } from "../../types/CookTimer";
import { formatTimeLeft, formatTimerDuration, secondsLeft, spokenTimeLeft } from "../../utils/formatCookTimer";
import CookBarButton from "./CookBarButton";

/** The next timer to finish, or a finished one if none are running, from every page. */
export default function CookTimersBar({
  now,
  onPress,
  timers,
}: {
  now: number;
  onPress: () => void;
  timers: CookTimer[];
}) {
  const { colors } = useTheme();
  const next = timers.find((timer) => secondsLeft(timer, now) > 0) ?? timers[0];
  if (!next) return null;

  const left = secondsLeft(next, now);
  const more = timers.length > 1 ? `, ${timers.length} timers` : "";
  const name = `Step ${next.stepNumber} timer`;

  return (
    <View style={{ backgroundColor: colors.muted }}>
      <CookBarButton
        accessibilityHint="Shows your timers."
        accessibilityLabel={`Step ${next.stepNumber}, ${formatTimerDuration(next.seconds)} timer, ${left > 0 ? `${spokenTimeLeft(left)} left` : "done"}${more}`}
        label={`${name}: ${left > 0 ? formatTimeLeft(left) : "done"}${more}`}
        onPress={onPress}
      />
    </View>
  );
}
