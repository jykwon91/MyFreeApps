import {
  Bar, CartesianGrid, ComposedChart, Legend, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { PersonalFinancesChartRow } from "@mybookkeeper/api-client/types/personal-finances/personal-finances-chart-row";
import { axisMoney } from "@mybookkeeper/api-client/utils/axisMoney";
import { useChartColors } from "@/shared/hooks/useChartColors";
import { useMonthRangeDrag } from "@/shared/hooks/useMonthRangeDrag";
import type { DateRange } from "@/shared/types/dashboard/date-range";
import { PERSONAL_FINANCES_CHART_HEIGHT } from "@/shared/lib/personal-finances-pages";
import { PERSONAL_FINANCES_MESSAGES as MSG } from "@/shared/lib/personal-finances-messages";
import PersonalFinancesChartTooltip from "./PersonalFinancesChartTooltip";

export interface PersonalFinancesChartProps {
  rows: PersonalFinancesChartRow[];
  /** A drag across the chart picked these months. */
  onRangeSelect: (range: DateRange) => void;
}

// Spending and mortgages & loans stack into one expenses bar.
const EXPENSES_STACK = "expenses";

/** Income against expenses per month, expenses split into spending and
 * mortgages & loans, with the net as a line. Dragging across picks months. */
export default function PersonalFinancesChart({ rows, onRangeSelect }: PersonalFinancesChartProps) {
  const colors = useChartColors();
  const monthByLabel = new Map(rows.map((row) => [row.label, row.month]));
  const drag = useMonthRangeDrag((label) => monthByLabel.get(label), onRangeSelect);
  return (
    <div role="img" aria-label={MSG.chartLabel} data-testid="personal-finances-chart" className="select-none">
      <ResponsiveContainer width="100%" height={PERSONAL_FINANCES_CHART_HEIGHT}>
        <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} {...drag.handlers}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={8} />
          <YAxis tickFormatter={axisMoney} tick={{ fontSize: 11 }} width={56} />
          <Tooltip content={<PersonalFinancesChartTooltip />} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="income" name={MSG.income} fill={colors.positive} radius={[2, 2, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="spending" name={MSG.spending} stackId={EXPENSES_STACK} fill={colors.negative} isAnimationActive={false} />
          <Bar
            dataKey="mortgagesLoans"
            name={MSG.mortgagesLoans}
            stackId={EXPENSES_STACK}
            fill={colors.loans}
            radius={[2, 2, 0, 0]}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="net"
            name={MSG.net}
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={{ r: 3 }}
            isAnimationActive={false}
          />
          {drag.overlay && drag.overlay.start !== drag.overlay.end ? (
            <ReferenceArea
              x1={drag.overlay.start}
              x2={drag.overlay.end}
              fill="hsl(var(--primary))"
              fillOpacity={0.15}
            />
          ) : null}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
