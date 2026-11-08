/** The skill a hand-written route step ends at: the last number in "1–65" or "225"; null when it has none. */
export function routeStepEnd(skill: string): number | null {
  const numbers = skill.match(/\d+/g);
  return numbers === null ? null : Number(numbers[numbers.length - 1]);
}
