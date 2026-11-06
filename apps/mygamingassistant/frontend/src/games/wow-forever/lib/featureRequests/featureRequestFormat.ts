/** How a feature request's fields read on screen. */
import {
  CONTEXT_ACTIVITY_LABEL,
  CONTEXT_CLASS_LABEL,
  CONTEXT_EXPERIENCE_LABEL,
  CONTEXT_FACTION_LABEL,
  CONTEXT_LEVEL_BAND_LABEL,
  CONTEXT_PROFESSION_LABEL,
  FEATURE_AREA_LABEL,
} from "@/games/wow-forever/data/featureRequests/featureRequestLabels";
import type { FeatureArea } from "@/games/wow-forever/types/featureRequests/featureArea";
import type { SubmissionContext } from "@/games/wow-forever/types/featureRequests/submissionContext";
import type { StoryText } from "@/games/wow-forever/types/featureRequests/storyText";

const SECONDS_PER_MINUTE = 60;

/** "1 player asked" / "12 players asked". */
export function playersAskedLabel(count: number): string {
  return `${count} ${count === 1 ? "player" : "players"} asked`;
}

/** The board's count: "1 idea" / "12 ideas". */
export function ideasCountLabel(count: number): string {
  return `${count} ${count === 1 ? "idea" : "ideas"}`;
}

/** "Professions · Alchemy" when the story has a topic, else just the area. */
export function areaChipLabel(area: FeatureArea, topic: string | null): string {
  const label = FEATURE_AREA_LABEL[area];
  const t = topic?.trim() ?? "";
  if (t === "") return label;
  return `${label} · ${t.charAt(0).toUpperCase()}${t.slice(1)}`;
}

function withoutEndStop(text: string): string {
  return text.trim().replace(/[.!\s]+$/, "");
}

function articleFor(persona: string): string {
  if (/^(a|an|the)\s/i.test(persona)) return "";
  if (/^[aeiou]/i.test(persona)) return "an ";
  return "a ";
}

/**
 * "As a new Warlock, I want …, so that …." — tolerant of how the refiner phrases each part: a persona that
 * already starts with "a"/"an"/"As", or an `i_want` / `so_that` that repeats its own lead-in. Words keep
 * their case (class and zone names are capitalised in game).
 */
export function storySentence(story: Pick<StoryText, "persona" | "i_want" | "so_that">): string {
  const persona = withoutEndStop(story.persona).replace(/^as\s+/i, "");
  const want = withoutEndStop(story.i_want).replace(/^i\s+want\s+/i, "");
  const soThat = withoutEndStop(story.so_that).replace(/^so\s+that\s+/i, "");
  return `As ${articleFor(persona)}${persona}, I want ${want}, so that ${soThat}.`;
}

/** Whole minutes left, rounded up, never below 1 while any time is left. */
export function minutesLeft(seconds: number): number {
  return Math.max(1, Math.ceil(seconds / SECONDS_PER_MINUTE));
}

/** "Come back in 12 minutes." / "Come back in 1 minute." / "Come back later." */
export function comeBackLabel(secondsLeft: number | null): string {
  if (secondsLeft === null || secondsLeft <= 0) return "Come back later.";
  const minutes = minutesLeft(secondsLeft);
  return `Come back in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`;
}

/** The "about you" answers in one line — "Warlock, 21–30, Alliance, Tailoring" — or "" when none. */
export function aboutYouSummary(context: SubmissionContext): string {
  const parts: string[] = [];
  if (context.class_id !== undefined) parts.push(CONTEXT_CLASS_LABEL[context.class_id]);
  if (context.level_band !== undefined) parts.push(CONTEXT_LEVEL_BAND_LABEL[context.level_band]);
  if (context.faction !== undefined && context.faction !== "undecided") parts.push(CONTEXT_FACTION_LABEL[context.faction]);
  if (context.experience !== undefined) parts.push(CONTEXT_EXPERIENCE_LABEL[context.experience]);
  for (const p of context.professions ?? []) parts.push(CONTEXT_PROFESSION_LABEL[p]);
  for (const a of context.activities ?? []) parts.push(CONTEXT_ACTIVITY_LABEL[a]);
  return parts.join(", ");
}
