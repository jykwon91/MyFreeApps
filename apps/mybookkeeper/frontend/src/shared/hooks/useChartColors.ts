import { useSyncExternalStore } from "react";
import { CHART_COLORS } from "@platform/core/constants/chartColors";

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

function isDark(): boolean {
  return document.documentElement.classList.contains("dark");
}

/** Revenue, expense and loan-payment colours for the current light or dark theme. */
export function useChartColors(): (typeof CHART_COLORS)[keyof typeof CHART_COLORS] {
  const dark = useSyncExternalStore(subscribe, isDark);
  return dark ? CHART_COLORS.dark : CHART_COLORS.light;
}
