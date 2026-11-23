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

/** Revenue and expense colours for the current light or dark theme. */
export function useChartColors(): { positive: string; negative: string } {
  const dark = useSyncExternalStore(subscribe, isDark);
  return dark ? CHART_COLORS.dark : CHART_COLORS.light;
}
