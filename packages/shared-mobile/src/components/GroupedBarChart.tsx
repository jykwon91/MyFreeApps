import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { BarChart, type barDataItem } from "react-native-gifted-charts";
import {
  CHART_LABEL_ROW_HEIGHT,
  CHART_LEGEND_SWATCH,
  CHART_SECTIONS,
  CHART_Y_AXIS_WIDTH,
} from "../constants/groupedBarChart";
import { MIN_TOUCH_TARGET } from "../theme/touchTarget";
import { useTheme } from "../theme/useTheme";
import type { GroupedBarChartProps } from "../types/GroupedBarChartProps";
import { groupedBarLayout } from "../utils/groupedBarLayout";

/**
 * Bars side by side per group, coloured by series, drawn in the theme's colours.
 *
 * The drawing is one image to a screen reader, read out as `accessibilityLabel`.
 * Each group is also a button laid over its own slot, with the group's label, so
 * the groups can be read and tapped one at a time; tapping a bar lands on it too.
 */
export default function GroupedBarChart({ series, groups, height, accessibilityLabel, formatValue, testID }: GroupedBarChartProps) {
  const { colors, spacing, fontSize } = useTheme();
  const [width, setWidth] = useState(0);
  const plotWidth = Math.max(width - CHART_Y_AXIS_WIDTH, 0);
  const layout = groupedBarLayout(plotWidth, groups.length, series.length);

  const data: barDataItem[] = groups.flatMap((group) =>
    series.map((item, index) => ({
      value: group.values[index] ?? 0,
      frontColor: item.color,
      spacing: index === series.length - 1 ? layout.groupGap : layout.barGap,
    })),
  );

  return (
    <View style={{ gap: spacing.sm }} testID={testID}>
      <View>
        <View
          accessibilityLabel={accessibilityLabel}
          accessibilityRole="image"
          accessible
          onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
          style={{ height }}
        >
          {plotWidth > 0 ? (
            <BarChart
              // Bars don't grow in, and the axis labels show at once rather than after a timer.
              animationDuration={0}
              barBorderTopLeftRadius={2}
              barBorderTopRightRadius={2}
              barWidth={layout.barWidth}
              data={data}
              disablePress
              disableScroll
              endSpacing={0}
              formatYLabel={formatValue ? (label) => formatValue(Number(label)) : undefined}
              height={height}
              initialSpacing={layout.initialSpacing}
              noOfSections={CHART_SECTIONS}
              rulesColor={colors.border}
              width={plotWidth}
              xAxisColor={colors.border}
              xAxisLabelsHeight={0}
              yAxisLabelWidth={CHART_Y_AXIS_WIDTH}
              yAxisTextStyle={{ fontSize: fontSize.xs, color: colors.mutedForeground }}
              yAxisThickness={0}
            />
          ) : null}
        </View>
        <View style={{ height: CHART_LABEL_ROW_HEIGHT }} />
        <View style={[StyleSheet.absoluteFill, { left: CHART_Y_AXIS_WIDTH, flexDirection: "row" }]}>
          {groups.map((group) => (
            <Pressable
              accessibilityLabel={group.accessibilityLabel}
              accessibilityRole={group.onPress ? "button" : "text"}
              disabled={!group.onPress}
              key={group.key}
              onPress={group.onPress}
              style={{ flex: 1, minHeight: MIN_TOUCH_TARGET, alignItems: "center", justifyContent: "flex-end" }}
            >
              <Text numberOfLines={1} style={{ fontSize: fontSize.xs, color: colors.mutedForeground }}>
                {group.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flexDirection: "row", gap: spacing.lg }}>
        {series.map((item) => (
          <View key={item.label} style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
            <View style={{ width: CHART_LEGEND_SWATCH, height: CHART_LEGEND_SWATCH, borderRadius: 2, backgroundColor: item.color }} />
            <Text style={{ fontSize: fontSize.sm, color: colors.foreground }}>{item.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
