/** Shared classes of the guild page's controls. */
export const GUILD_CONTROL =
  "w-full min-h-[44px] rounded-md border bg-background px-3 py-2 text-base sm:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
/** A number cell of the member table. */
export const GUILD_NUMBER_CELL = "px-3 py-1 text-right tabular-nums";
/** A leaderboard row (full width under the podium's three columns). */
export const LEADERBOARD_ROW =
  "flex min-h-[44px] items-center gap-3 rounded-lg border bg-card px-3 py-1.5 sm:col-span-3";
/** The viewer's own row or card: a ring and tint, never colour alone (it also says "You"). */
export const LEADERBOARD_MINE = "ring-2 ring-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.1)]";
/**
 * The board picker's grid. ``grid-cols-1`` (``minmax(0, 1fr)``) on a phone: an implicit column would grow to the
 * chips row's full width and push the card off the screen.
 */
export const LEADERBOARD_PICKER_GRID = "grid grid-cols-1 gap-3 sm:grid-cols-2";
/** A podium card: a row on a phone (its bar wraps to a line of its own); 1st is taller, with a gold border and glow. */
export const PODIUM_CARD = "flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3 sm:flex-col sm:justify-end sm:gap-2 sm:p-4 sm:text-center";
export const PODIUM_CARD_FIRST = "border-2 bg-gradient-to-b from-[#F2C94C]/25 to-[hsl(var(--card))] sm:min-h-[208px]";
export const PODIUM_CARD_OTHER = "sm:min-h-[172px]";
/** Where each podium card stands on wide screens: the first in the middle, the second left, the third right. */
export const PODIUM_SLOTS = ["sm:col-start-2", "sm:col-start-1", "sm:col-start-3"] as const;
/** A board category chip, and the one picked. */
export const LEADERBOARD_CHIP =
  "min-h-[44px] shrink-0 snap-start rounded-full border bg-card px-4 text-sm font-medium text-card-foreground transition-colors hover:bg-[hsl(var(--muted)/0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
export const LEADERBOARD_CHIP_ON = "border-[hsl(var(--primary))] bg-primary text-primary-foreground";
/** A member's name in their class colour (``memberClassStyle`` sets the variables); plain text for an unknown class. */
export const CLASS_NAME_TEXT = "text-[var(--c-light,currentColor)] dark:text-[var(--c-dark,currentColor)]";

/** A guild title badge; all-time ones are solid gold-edged, this week's dashed and plain (they also say "This week"). */
export const GUILD_TITLE_BADGE = "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold";
export const GUILD_TITLE_BADGE_ALL_TIME = "bg-[#F2C94C]/20 text-card-foreground";
export const GUILD_TITLE_BADGE_WEEKLY = "border-dashed bg-card text-muted-foreground";
