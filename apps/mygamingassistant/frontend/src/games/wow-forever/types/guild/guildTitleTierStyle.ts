/** How a rarity tier looks. Every value is whole Tailwind classes so the build can see them. */
export interface GuildTitleTierStyle {
  /** "Epic". */
  label: string;
  /** Higher = rarer; titles sort by it. */
  rank: number;
  /** The medallion: gradient, 2px tier border and glow. */
  medallion: string;
  /** The title's name: a darker tint on a light card, the tier colour on a dark one (4.5:1 either way). */
  name: string;
  /** The tint behind a title: the card, or the pill by a member's name. */
  tint: string;
  /** A slow shine sweeps over the medallion (epic and legendary only). */
  shine: boolean;
}
