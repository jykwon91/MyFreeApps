// A static accessibilityLabel replaces the visible text for screen readers. While
// loading, keep the label's context and add the loading text so "Saving..." is heard too.
export function loadingAccessibilityLabel(
  label: string | undefined,
  loadingText: string | undefined,
  isBusy: boolean,
): string | undefined {
  if (!isBusy || !label || !loadingText) return label;
  return `${label}, ${loadingText}`;
}
