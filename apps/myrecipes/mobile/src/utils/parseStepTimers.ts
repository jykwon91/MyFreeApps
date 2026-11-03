import { COOK_TIMER_MAX_SECONDS, COOK_TIMER_MIN_SECONDS } from "../constants/cook";
import type { StepTimer } from "../types/StepTimer";

const ONES = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const TEENS = ["ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const WORD_VALUES = new Map<string, number>([
  ...ONES.map((word, index): [string, number] => [word, index + 1]),
  ...TEENS.map((word, index): [string, number] => [word, index + 10]),
  ...TENS.map((word, index): [string, number] => [word, (index + 2) * 10]),
]);

const VULGAR_FRACTIONS: Record<string, string> = { "½": "1/2", "¼": "1/4", "¾": "3/4", "⅓": "1/3", "⅔": "2/3" };

const DIGITS = "\\d+ \\d/\\d|\\d/\\d|\\d+(?:[.,]\\d+)?";
const TENS_AND_TEENS = `(?:${TENS.join("|")})(?:[- ](?:${ONES.join("|")}))?|${TEENS.join("|")}`;
const WORDS = `${TENS_AND_TEENS}|${ONES.join("|")}`;
const NUMBER = `${DIGITS}|${WORDS}`;

function atom(unit: string, gluedUnit: string, numbers: string): string {
  const half = `(?:an? )?half(?: an?)?[- ](?:${unit})`;
  const quarter = `(?:three[- ]|a )?quarters?(?: of an?| an?)? (?:${unit})`;
  const counted = `(?:${numbers})(?: and a half)?(?: (?:more|additional|further|extra))? (?:${unit})`;
  const glued = gluedUnit ? `|(?:${DIGITS})(?:${gluedUnit})` : "";
  return `(?:${half}|${quarter}|${counted}(?: and a (?:half|quarter))?${glued})(?![-\\w])`;
}

const HOUR_WORDS = "hours?|hrs?";
const MINUTE_WORDS = "minutes?|mins?";
const SECOND_WORDS = "seconds?|secs?";
const HOUR = atom(HOUR_WORDS, "h|hrs?", `${NUMBER}|an?`);
const MINUTE = atom(MINUTE_WORDS, "m|mins?", `${NUMBER}|an?`);
// "A second" and "one second" usually mean "another", as in "add a second layer".
const SECOND = atom(SECOND_WORDS, "", `${DIGITS}|${TENS_AND_TEENS}|${ONES.slice(1).join("|")}`);

// After a comma, "10 minutes before the end" is a new thought, not more of the same time.
const JOIN = "(?: and | |,(?: and)? (?!\\S+ \\S+ (?:before|after)\\b))";
const SPAN = [
  `${HOUR}(?:${JOIN}${MINUTE})?(?:${JOIN}${SECOND})?`,
  `${MINUTE}(?:${JOIN}${SECOND})?`,
  SECOND,
].join("|");
const DASH = " ?[-–—] ?";

// Hyphenated ranges start with digits, or the hyphen in "forty-five minutes" would be one.
// Groups: a word saying this isn't a wait, a word or digit low end, a digit low end, the duration,
// the next duration.
const DURATION = new RegExp(
  `(?<![\\w./,-])((?:every|each|within|total time:?|prep time:?) )?(?:(${NUMBER}) (?:to|or) |(${DIGITS})${DASH})?(${SPAN})(?:(?: to | or |${DASH})(${SPAN}))?`,
  "gi",
);
const SPAN_PARTS = new RegExp(`${HOUR}|${MINUTE}|${SECOND}`, "gi");
const ADJECTIVE = new RegExp(`^(${NUMBER}) (?:hour|hr|minute|min|second|sec)$`, "i");
const NOT_A_WAIT_AFTER = /^ (?:ahead|in advance|earlier|intervals?|increments?|bursts?)\b/i;
// "Gas mark 4 - 30 minutes" and "Step 2 - 5 minutes" aren't ranges.
const LABEL_BEFORE = /(?:mark|step|number|no\.?|regulo|#) ?$/i;

function normalize(instruction: string): string {
  return instruction
    .replace(/(\d)?([½¼¾⅓⅔])/g, (_, whole: string | undefined, fraction: string) =>
      `${whole ? `${whole} ` : ""}${VULGAR_FRACTIONS[fraction]}`,
    )
    .replace(/(\d)(?:-| and )(\d\/\d)/gi, "$1 $2")
    .replace(/\s+/g, " ");
}

function toNumber(text: string): number {
  const lower = text.toLowerCase().replace(",", ".");
  if (lower === "a" || lower === "an") return 1;
  const fraction = lower.match(/^(?:(\d+) )?(\d)\/(\d)$/);
  if (fraction) return Number(fraction[1] ?? 0) + Number(fraction[2]) / Number(fraction[3]);
  const words = lower.split(/[- ]/);
  if (words.every((word) => WORD_VALUES.has(word))) {
    return words.reduce((total, word) => total + WORD_VALUES.get(word)!, 0);
  }
  return Number(lower);
}

function unitSeconds(part: string): number {
  const unit = part.toLowerCase().match(/[\d\s-](h|m|s)[a-z]*(?: and a (?:half|quarter))?$/);
  if (!unit) return 0;
  if (unit[1] === "h") return 3600;
  return unit[1] === "m" ? 60 : 1;
}

function partSeconds(part: string): number {
  const unit = unitSeconds(part);
  if (/^(?:an? )?half/i.test(part)) return unit / 2;
  if (/^three[- ]quarters?/i.test(part)) return unit * 0.75;
  if (/^(?:a )?quarter/i.test(part)) return unit / 4;
  const counted = part.match(new RegExp(`^(${NUMBER}|an?)(?= |h|m)`, "i"));
  if (!counted) return 0;
  const extra = / and a half/i.test(part) ? 0.5 : / and a quarter/i.test(part) ? 0.25 : 0;
  return (toNumber(counted[1]!) + extra) * unit;
}

function spanSeconds(span: string): number {
  return [...span.matchAll(SPAN_PARTS)].reduce((total, [part]) => total + partSeconds(part), 0);
}

function matchSeconds(match: RegExpExecArray | RegExpMatchArray, source: string): number[] {
  // Positions, not named groups: named groups came back empty on Hermes.
  const [text, notAWait, wordLow, dashLow, span, next] = match;
  const before = source.slice(0, match.index);
  const after = source.slice(match.index! + text.length);
  if (notAWait || NOT_A_WAIT_AFTER.test(after)) return [];

  // "5 minute oats": a singular unit after a number above one, with a word following.
  const adjective = ADJECTIVE.exec(span!);
  if (adjective && toNumber(adjective[1]!) !== 1 && /^ [a-z]/i.test(after)) return [];

  const seconds = spanSeconds(span!);
  const nextSeconds = next ? spanSeconds(next) : 0;
  // A next duration that's no longer isn't the top of a range: "1 hour - 10 minutes rest".
  const separate = nextSeconds > 0 && nextSeconds <= seconds ? [nextSeconds] : [];

  const low = wordLow ?? dashLow;
  if (low && !LABEL_BEFORE.test(before)) {
    const lowSeconds = toNumber(low) * unitSeconds([...span!.matchAll(SPAN_PARTS)][0]![0]);
    // Anything longer than its "top" is something else: "Bake at 350 - 25 minutes".
    if (lowSeconds < seconds) return [lowSeconds, ...separate];
  }
  return [seconds, ...separate];
}

/** The waits a step mentions, once each, in the order it mentions them. */
export function parseStepTimers(instruction: string): StepTimer[] {
  const source = normalize(instruction);
  const seen = new Set<number>();
  for (const match of source.matchAll(DURATION)) {
    for (const seconds of matchSeconds(match, source)) {
      const rounded = Math.round(seconds);
      if (rounded >= COOK_TIMER_MIN_SECONDS && rounded <= COOK_TIMER_MAX_SECONDS) seen.add(rounded);
    }
  }
  return [...seen].map((seconds) => ({ seconds }));
}
