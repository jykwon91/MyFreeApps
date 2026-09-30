/** A text link with a phone-sized tap target. */
export const DETAIL_LINK =
  "inline-flex items-center gap-1 text-sm text-primary underline-offset-2 hover:underline min-h-[44px] sm:min-h-[32px]";

export const DETAIL_CHIP = "inline-block rounded border px-1.5 py-0.5 text-xs text-muted-foreground";

export const DETAIL_SECTION = "rounded-xl border bg-card p-4 sm:p-5 space-y-3";

/** "Horde" / "Alliance" for the other-faction toggle. */
export const FACTION_NAME: Readonly<Record<string, string>> = { A: "Alliance", H: "Horde", N: "Neutral" };
