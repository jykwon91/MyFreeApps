/** The fun sections' copy: this week's heroes, hot races, your quests, and the roll call. */
export const HEROES_COPY = {
  heading: "This week's heroes",
  window: (days: number) => `Biggest gains over the last ${days} ${days === 1 ? "day" : "days"}`,
  empty: "No heroes yet. Gains show up once members have been looked up on two different days.",
  listLabel: "This week's heroes",
  noRival: "Nobody else is on the board yet. The crown is wide open.",
  deadHeat: (rival: string) => `Dead heat with ${rival}!`,
  chase: (rival: string, behind: string) => `${rival} is ${behind} behind — defend the crown!`,
} as const;

export const HOT_RACES_COPY = {
  heading: "Hot races",
  note: "The closest fights for first place right now.",
  listLabel: "Hot races",
  versus: "VS",
  apart: (gap: string) => `${gap} apart`,
} as const;

export const QUESTS_COPY = {
  heading: "Your quests",
  listLabel: "Your quests",
  note: "The titles you could steal next.",
  empty: "No title is within reach yet. Keep adventuring and check back.",
  nudge: "Want your own quests? Look up your character, then open its guild badge to see the titles you could steal.",
  nudgeLink: "Look up your character",
  take: (need: string, title: string, holder: string) => `${need} to take ${title} from ${holder}`,
  wait: (holder: string, ahead: string, title: string) =>
    `${holder} leads ${title} by ${ahead}. Pray they meet the Spirit Healer.`,
  others: (count: number) => ` and ${count} ${count === 1 ? "other" : "others"}`,
} as const;

export const TITLE_CARD_COPY = {
  challenger: (rival: string, behind: string) => `Closest challenger: ${rival}, ${behind} behind`,
} as const;

export const ROLL_CALL_COPY = {
  heading: (count: number) => `Roll call (${count})`,
} as const;

export const ARENA_HEADING = "The Arena";

export const CHAMPION_RIBBON = "Champion";

/** Hot races listed, and quests listed. */
export const HOT_RACES_SHOWN = 3;
export const QUESTS_SHOWN = 3;
/** A race is "hot" only while the runner-up is within this share of the leader's number: a 90% gap isn't a race. */
export const HOT_RACE_MAX_RELATIVE_GAP = 0.5;
/** Cards in the page skeleton's heroes strip. */
export const GUILD_HEROES_SKELETON_CARDS = 3;
