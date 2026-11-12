/** What the guild reputation board asks for. */
export interface GuildReputationsArgs {
  slug: string;
  /** The faction picked (`?faction=`); null for the default (the one most members have met). */
  faction: number | null;
}
