/** 1 → "1st", 2 → "2nd", 11 → "11th", 23 → "23rd". */
export function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = { 1: "st", 2: "nd", 3: "rd" }[n % 10];
  return `${n}${!teen && suffix ? suffix : "th"}`;
}
