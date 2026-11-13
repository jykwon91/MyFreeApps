import { useTheme } from "@platform/mobile";
import { useState } from "react";
import { Text, View } from "react-native";
import { INQUIRY_CREATE_MESSAGES as MESSAGES } from "../../constants/inquiryCreate";
import type { InquiryReceivedAtFieldProps } from "../../types/InquiryReceivedAtFieldProps";
import PeriodDateRow from "../shell/PeriodDateRow";
import TimeField from "../shell/TimeField";
import { joinReceivedAt, splitReceivedAt } from "./inquiryReceivedAt";

/** When they reached out, as a date and a time of day. It starts at now; a backdated one is picked here. */
export default function InquiryReceivedAtField({ value, onChange, error }: InquiryReceivedAtFieldProps) {
  const { colors, spacing, fontSize } = useTheme();
  const [isDateOpen, setIsDateOpen] = useState(false);
  const { date, time } = splitReceivedAt(value);

  return (
    <View style={{ gap: spacing.md }}>
      <PeriodDateRow
        isOpen={isDateOpen}
        label={MESSAGES.receivedDate}
        onChange={(next) => onChange(joinReceivedAt(next, time))}
        onToggle={() => setIsDateOpen((open) => !open)}
        value={date}
      />
      <TimeField label={MESSAGES.receivedTime} onChange={(next) => onChange(joinReceivedAt(date, next))} value={time} />
      {error ? (
        <Text accessibilityRole="alert" style={{ fontSize: fontSize.sm, color: colors.destructiveText }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
