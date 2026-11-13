/** How big a member's name is: `sm` in tables and crafter lists, `md` on cards and boards, `lg` for a hero or the guild master, `xl` for a title's holder. */
export const GUILD_MEMBER_NAME_SIZES = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-lg sm:text-xl",
  xl: "text-xl sm:text-2xl",
} as const;
