/** Shared classes of the guild page's controls. */
export const GUILD_CONTROL =
  "w-full min-h-[44px] rounded-md border bg-background px-3 py-2 text-base sm:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
/** A number cell of the member table. */
export const GUILD_NUMBER_CELL = "px-3 py-1 text-right tabular-nums";
/** A leaderboard row (full width under the podium's three columns). */
export const LEADERBOARD_ROW =
  "flex min-h-[44px] items-center gap-3 rounded-lg border bg-card px-3 py-1.5 sm:col-span-3";
/** The viewer's own row or card: a ring and tint, never colour alone (it also says "You"). */
export const LEADERBOARD_MINE = "ring-2 ring-primary bg-primary/10";
/**
 * The board picker's grid. ``grid-cols-1`` (``minmax(0, 1fr)``) on a phone: an implicit column would grow to the
 * chips row's full width and push the card off the screen.
 */
export const LEADERBOARD_PICKER_GRID = "grid grid-cols-1 gap-3 sm:grid-cols-2";
/** A podium card: a row on a phone (its bar wraps to a line of its own); 1st is taller, with a gold border and glow. */
export const PODIUM_CARD = "flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3 sm:flex-col sm:justify-end sm:gap-2 sm:p-4 sm:text-center";
export const PODIUM_CARD_FIRST =
  "border-2 bg-gradient-to-b from-[#F2C94C]/25 to-card shadow-[0_0_24px_4px_rgba(242,201,76,0.35)] sm:min-h-[208px]";
/** A podium card's top border wears the member's class colour (``memberClassStyle`` sets the variables). */
export const PODIUM_CLASS_TOP = "relative border-t-4 border-t-[color:var(--c-light,transparent)] dark:border-t-[color:var(--c-dark,transparent)]";
/** The "Champion" ribbon on a 1st-place card. */
export const PODIUM_RIBBON =
  "absolute left-3 top-0 -translate-y-1/2 rounded-full bg-[#F2C94C] px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-slate-900 shadow sm:left-1/2 sm:-translate-x-1/2";
export const PODIUM_CARD_OTHER = "sm:min-h-[172px]";
/** Where each podium card stands on wide screens: the first in the middle, the second left, the third right. */
export const PODIUM_SLOTS = ["sm:col-start-2", "sm:col-start-1", "sm:col-start-3"] as const;
/** A board category chip, and the one picked. */
export const LEADERBOARD_CHIP =
  "min-h-[44px] shrink-0 snap-start rounded-full border bg-card px-4 text-sm font-medium text-card-foreground transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
export const LEADERBOARD_CHIP_ON = "border-primary bg-primary text-primary-foreground";
/** A member's name in their class colour (``memberClassStyle`` sets the variables); plain text for an unknown class. */
export const CLASS_NAME_TEXT = "text-[var(--c-light,currentColor)] dark:text-[var(--c-dark,currentColor)]";

/**
 * A guild title medallion: a shield-ish shape (flat shoulders, rounded point) on a tier gradient with a 2px tier
 * border and glow (``GUILD_TITLE_TIER_STYLES``). Epic and legendary ones get a slow shine sweep that holds still
 * for anyone who prefers reduced motion (``guild-shine`` is in index.css).
 */
export const TITLE_MEDALLION =
  "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-t-lg rounded-b-[45%] border-2 bg-gradient-to-br text-white";
export const TITLE_MEDALLION_SIZE = { card: "h-11 w-10", inline: "h-8 w-7" } as const;
export const TITLE_ICON_SIZE = { card: "h-6 w-6", inline: "h-4 w-4" } as const;
export const TITLE_SHINE =
  "pointer-events-none absolute inset-y-0 -left-full w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/50 to-transparent animate-[guild-shine_3.5s_ease-in-out_infinite] motion-reduce:animate-none";
/** The title by a member's name: a pill tinted in the tier colour. */
export const TITLE_PILL = "inline-flex max-w-full items-center gap-1.5 rounded-lg border py-0.5 pl-1 pr-2";
/** The small "This week" pip on a weekly title. */
export const TITLE_PIP = "rounded-full border border-current px-1.5 text-[10px] font-semibold uppercase leading-4 tracking-wide";

/** A section of the fun part of the guild page. */
export const HALL_SECTION = "space-y-3 rounded-xl border bg-card p-3 sm:p-4";
export const ROLL_CALL_SECTION = `group ${HALL_SECTION}`;
export const HALL_HEADING = "flex items-center gap-2 text-lg font-bold";
/** A title card in the Hall of Titles; the tier's tint goes with it. */
export const TITLE_CARD = "flex flex-col gap-1.5 rounded-xl border-2 p-3";
/** The weekly heroes' row: a snapping strip scrolling inside itself on a phone, a grid from `sm`. */
export const HERO_STRIP =
  "-mx-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-3 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-3";
export const HERO_CARD =
  "relative flex w-[78%] min-w-[240px] shrink-0 snap-start flex-col gap-1 rounded-xl border-2 border-[#ff8000]/50 bg-gradient-to-b from-[#ff8000]/10 to-card p-3 sm:w-auto sm:min-w-0";
/** The banner's text on its dark field, in a member's in-game class colour (the light-theme darkening would be too dim here). */
export const CLASS_NAME_TEXT_ON_DARK = "text-[var(--c-dark,currentColor)]";
