/** The typed minimum salary as whole dollars, or null when it is blank, not a number, or not above zero. */
export function positiveSalary(text: string): number | null {
  const value = Number(text);
  return text && Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
}
