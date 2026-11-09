import { useState } from "react";
import { View } from "react-native";
import { useTheme } from "@platform/mobile";
import PeriodDateRow from "../shell/PeriodDateRow";

/** The two days of a custom range. The end can never fall before the start. */
export default function CustomRangeFields({
  startDate,
  endDate,
  onChange,
}: {
  startDate: string;
  endDate: string;
  onChange: (range: { startDate: string; endDate: string }) => void;
}) {
  const { spacing } = useTheme();
  const [openDate, setOpenDate] = useState<"start" | "end" | null>(null);
  const toggle = (which: "start" | "end") => setOpenDate((current) => (current === which ? null : which));

  return (
    <View style={{ gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
      <PeriodDateRow
        isOpen={openDate === "start"}
        label="From"
        onChange={(start) => onChange({ startDate: start, endDate: endDate < start ? start : endDate })}
        onToggle={() => toggle("start")}
        value={startDate}
      />
      <PeriodDateRow
        isOpen={openDate === "end"}
        label="To"
        minimum={startDate}
        onChange={(end) => onChange({ startDate, endDate: end })}
        onToggle={() => toggle("end")}
        value={endDate}
      />
    </View>
  );
}
