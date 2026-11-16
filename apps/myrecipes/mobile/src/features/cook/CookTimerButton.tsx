import { useScreenReaderEnabled } from "@platform/mobile";
import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";
import { COOK_TIMER_CONFIRM_MS, COOK_TIMER_CONFIRM_SCREEN_READER_MS } from "../../constants/cook";
import type { CookTimer } from "../../types/CookTimer";
import { formatTimeLeft, formatTimerDuration, secondsLeft, spokenTimeLeft } from "../../utils/formatCookTimer";
import CookBarButton from "./CookBarButton";
import { useCookNow } from "./useCookNow";

/** One button in every state, so a screen reader's focus stays on it. Cancel takes a second tap. */
export default function CookTimerButton({
  onRemove,
  onStart,
  seconds,
  timer,
}: {
  onRemove: (timerId: string) => void;
  onStart?: () => void;
  seconds: number;
  timer: CookTimer | undefined;
}) {
  const [isConfirming, setIsConfirming] = useState(false);
  const isScreenReaderOn = useScreenReaderEnabled();
  const now = useCookNow();
  const duration = formatTimerDuration(seconds);
  // Hearing the button read out takes longer than seeing it change.
  const confirmMs = isScreenReaderOn ? COOK_TIMER_CONFIRM_SCREEN_READER_MS : COOK_TIMER_CONFIRM_MS;

  useEffect(() => {
    if (!isConfirming) return undefined;
    const reset = setTimeout(() => setIsConfirming(false), confirmMs);
    return () => clearTimeout(reset);
  }, [confirmMs, isConfirming]);

  function remove(id: string): void {
    setIsConfirming(false);
    onRemove(id);
  }

  if (!timer) {
    return <CookBarButton isPrimary label={`Start ${duration} timer`} onPress={() => onStart?.()} />;
  }

  const left = secondsLeft(timer, now);
  if (left === 0) {
    return (
      <CookBarButton
        accessibilityLabel={`Dismiss ${duration} timer, done`}
        isPrimary
        label="Timer done · Dismiss"
        onPress={() => remove(timer.id)}
      />
    );
  }
  if (isConfirming) {
    return (
      <CookBarButton
        accessibilityLabel={`Tap again to cancel the ${duration} timer`}
        isOutlined
        label="Tap again to cancel"
        onPress={() => remove(timer.id)}
      />
    );
  }
  return (
    <CookBarButton
      accessibilityLabel={`${duration} timer, ${spokenTimeLeft(left)} left. Cancel`}
      isOutlined
      label={`${formatTimeLeft(left)} left`}
      onPress={() => {
        setIsConfirming(true);
        AccessibilityInfo.announceForAccessibility("Tap again to cancel");
      }}
    />
  );
}
