const BACK_LABELS: readonly (readonly [string, string])[] = [
  ["/wow-forever/gear", "Back to Best gear"],
  ["/wow-forever/compare", "Back to Item Compare"],
  ["/wow-forever/items", "Back to the last item"],
];

/** Where Back goes when the page was opened from another WoW Forever page (router state `{ from }`). */
export function backFromState(state: unknown): { to: string; label: string } | null {
  if (typeof state !== "object" || state === null || !("from" in state)) return null;
  const from = state.from;
  if (typeof from !== "string" || !from.startsWith("/wow-forever")) return null;
  const label = BACK_LABELS.find(([path]) => from.startsWith(path))?.[1] ?? "Back";
  return { to: from, label };
}
