/**
 * Known Forever (beta) differences that change how you get around. The map
 * data is Classic-era unless captured, so these are called out separately.
 * Link a source where one is published.
 */
export interface ForeverNote {
  id: string;
  text: string;
  source?: { label: string; url: string };
}

export const FOREVER_NOTES: readonly ForeverNote[] = [
  {
    id: "powderfuse",
    text: "Powderfuse Port (Riverglades) has no flight path — walk or ride in.",
  },
  {
    id: "dalaran",
    text: "A portal links Stormwind and Dalaran, but Dalaran has no auction house, bank or flight path.",
  },
  {
    id: "summoning-stones",
    text: "Meeting stones don't summon during the beta — travel to the dungeon yourself.",
  },
  {
    id: "warlock-even-levels",
    text: "Warlocks get new spells to train on even levels (2, 4, 6 …).",
    source: { label: "foreverchanges.pro", url: "https://foreverchanges.pro/" },
  },
  {
    id: "zephras",
    text: "Zephras Isle (the Skyborne start, levels 1–12, either faction) has trainers that aren't published yet — they're not on this map.",
  },
];
